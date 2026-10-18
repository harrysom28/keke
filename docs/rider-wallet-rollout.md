# Rider wallet: one source of truth — rollout

## What changed

- `UserWallet.availableBalance` (`userType: 'rider'`) is the only spendable rider balance. `User.balance` is a legacy
  mirror, written only by `services/riderBalanceService.js` and never read to decide what can be spent.
- Every rider has exactly one wallet. It is created at signup (model hook) and on demand (race-safe, the unique `userId`
  index decides), seeded from `User.balance`.
- Every rider credit or debit goes through `riderBalanceService.js`: ledger row claimed first
  (`UserWalletTransaction`, `pending`, unique sparse `idempotencyKey`) -> one atomic `$inc` on the wallet -> row marked
  `completed`. A throw marks the row `failed` (a retry may re-claim it). A row left `pending` is never retried
  automatically; it is reported for a human.
- Money Paystack received but the webhook missed is found every 10 minutes (2-day window) and daily at 03:30
  (14-day window), and credited, or recorded in `PaystackUnmatchedPayment` for an admin.
- The gap between `User.balance` and the wallet is **never** moved automatically (part of it can be the same payment
  counted twice). Only a human-approved CSV moves money.

Idempotency keys: `refund:ride:<rideId>`, `refund:dispute:<paymentId>`, `refund:payment:<paymentId>:<refundedSoFar>`,
`reward:milestone:<userId>`, `reward:referral:<userId>:<claimNumber>`, `change:<rideId>`, `fare:wallet:<rideId>`,
`stripe:<paymentIntentId>`, `reconcile:<yyyy-mm-dd>:<userId>`. Card and bank-transfer top-ups use the Paystack reference
through `WalletFundingTransaction` (shared by the webhook, the app's verify call and the reconcile job).

## Before you deploy (one-off checks)

`UserWallet.userId` and `UserWalletTransaction.idempotencyKey` must really be unique indexes in production:

```js
db.userwallets.getIndexes()              // expect { userId: 1 } unique
db.userwallettransactions.getIndexes()   // expect { idempotencyKey: 1 } unique, sparse
db.userwallets.aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])  // expect nothing
```

If duplicates exist, resolve them by hand first; the unique index cannot build over them.

## Steps

All scripts are dry runs unless they say `--apply`. In production run them in the container (it already has the
production DB settings): `docker exec keke-backend node scripts/<name>.js`.

1. **Deploy the code.** The balance screen still uses `max(wallet, User.balance)`, so nobody sees a balance drop.
2. **Create missing wallets.** Each is seeded from the rider's `User.balance`, so this creates no gap.
   ```
   docker exec keke-backend node scripts/backfillRiderWallets.js
   docker exec keke-backend node scripts/backfillRiderWallets.js --apply
   ```
3. **Credit payments the webhook missed.** Idempotent by Paystack reference.
   ```
   docker exec keke-backend node scripts/reconcilePaystackFunding.js 30
   docker exec keke-backend node scripts/reconcilePaystackFunding.js 30 --apply
   ```
   Anything that cannot be tied to exactly one live rider lands in `PaystackUnmatchedPayment` (admin: Finance ->
   Unmatched deposits).
4. **Review the balance gaps by hand.**
   ```
   docker exec keke-backend node scripts/reconcileRiderBalances.js
   ```
   It writes `rider-balance-gaps-<timestamp>.csv` in the working directory (copy it out with `docker cp`). For each
   rider you verified against Paystack and the ride history, fill `approved_delta` (positive adds to the wallet,
   negative removes) and `reason`; delete the other rows. `suggested_delta` is only an upper bound. Rows with
   `double_count_suspect > 0` contain money counted twice: do not move that part. Save the file as `approved.csv`
   (columns `userId,approved_delta,reason`; rows without a reason are skipped) and apply it:
   ```
   docker exec keke-backend node scripts/reconcileRiderBalances.js --apply-file approved.csv
   ```
   Each applied row is a `reconciliation` ledger row with key `reconcile:<date>:<userId>`; running the same file twice
   the same day moves nothing the second time.
5. **Switch the balance screen to the wallet.** Set `RIDER_BALANCE_WALLET_ONLY=true` and restart.
   **Warning: this can lower the balance a rider sees** if their old `User.balance` was higher than the wallet and the
   gap was not approved in step 4. Check the gap CSV again right before the switch.
6. **Watch for a week:**
   - open `PaystackUnmatchedPayment` rows;
   - ledger rows stuck in `pending` (a credit or debit that died half way): re-running `reconcileRiderBalances.js`
     counts them in `stuck_pending_rows`. Check the wallet by hand and then fix the row or the balance with an
     approved reconciliation;
   - audit entries `wallet_adjust` (admin balance edits).

Settings: `PAYSTACK_RECONCILE_ENABLED=false` turns the cron off; it is also off without `PAYSTACK_SECRET_KEY`.

## Tests

They empty every collection they touch and refuse to run unless the connected database name contains `test`. They also
refuse FerretDB. Use a real MongoDB, ideally a replica set, so the Mongo transaction paths run:

```
cd backend
TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_wallet_test?replicaSet=rs0' node scripts/verifyRiderWallet.js
TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_flows_test?replicaSet=rs0'  node scripts/verifyRiderCreditFlows.js
```

## Behaviour changes to know about

- `getOrCreateRiderWallet` no longer copies `User.balance` into an existing wallet that "looks unused" (wallet 0, no
  holds, nothing spent, mirror > 0). That was an automatic gap move on every booking check. Riders in that state are
  now handled by step 4.
- A wallet-method ride that did not go through escrow is now charged from the real wallet instead of the mirror.
- Admin balance edits need `balanceReason` (3-300 characters) when the balance changes, write a ledger row and a
  `wallet_adjust` audit entry, and only work for riders.
- A dispute refund now credits the wallet before the payment row is marked `refunded`, so a failed credit leaves the
  dispute resolvable instead of stuck.

## Known leftovers (not fixed here)

- Profile/auth responses (`formatUserResponse`) still return the `User.balance` mirror. The helper keeps it in sync;
  `getCurrentUser` overrides it for riders.
- Hard-deleting a user leaves an orphan wallet document.
- `creditWalletFromPaystack` (already live, deliberately unchanged apart from creating the wallet first) still writes
  the `User.balance` mirror itself when a rider wallet exists, and increments `User.balance` directly for non-rider
  (driver) users.
- The Stripe top-up routes (`topUpWallet`, `confirmStripePayment`) credit a rider wallet for any caller; a driver
  using them would get a rider wallet created. Drivers are not expected to use them.
