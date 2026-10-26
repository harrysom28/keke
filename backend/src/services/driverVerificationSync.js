/**
 * Decide the driver-level approval state from the two sub-documents.
 *
 * An approve on one document must not knock an already-approved driver back
 * to pending just because the other document is missing or still pending.
 * Demotion happens only when a sub-document is explicitly rejected.
 * A partial pending state never clears an existing rejection reason.
 */

const RANK = { rejected: 0, pending: 1, approved: 2 };

export function decideDriverVerification({
  driverStatus = "pending",
  documentsVerified = false,
  rejectionReason = null,
  kycStatus = null,
  vehicleStatus = null,
  kycRejectionReason = null,
  vehicleRejectionReason = null,
} = {}) {
  const bothVerified = kycStatus === "verified" && vehicleStatus === "verified";
  const rejectionParts = [];
  if (kycStatus === "rejected") {
    rejectionParts.push(`Identity: ${kycRejectionReason || "Rejected by admin"}`);
  }
  if (vehicleStatus === "rejected") {
    rejectionParts.push(`Vehicle: ${vehicleRejectionReason || "Rejected by admin"}`);
  }

  let verificationStatus;
  let nextDocumentsVerified;
  let nextReason;
  let userKycStatus;
  let promoted = false;

  if (bothVerified) {
    verificationStatus = "approved";
    nextDocumentsVerified = true;
    nextReason = null;
    userKycStatus = "verified";
    promoted = driverStatus !== "approved";
  } else if (rejectionParts.length > 0) {
    verificationStatus = "rejected";
    nextDocumentsVerified = false;
    nextReason = rejectionParts.join("; ");
    userKycStatus = "rejected";
  } else if (driverStatus === "approved") {
    verificationStatus = "approved";
    nextDocumentsVerified = true;
    nextReason = rejectionReason || null;
    userKycStatus = "verified";
  } else {
    verificationStatus = "pending";
    nextDocumentsVerified = false;
    nextReason = rejectionReason || null;
    userKycStatus = "pending";
  }

  const previousRank = RANK[driverStatus] ?? RANK.pending;
  const nextRank = RANK[verificationStatus] ?? RANK.pending;

  return {
    verificationStatus,
    documentsVerified: nextDocumentsVerified,
    rejectionReason: nextReason,
    userKycStatus,
    promoted,
    demoted: nextRank < previousRank,
    changed:
      driverStatus !== verificationStatus ||
      Boolean(documentsVerified) !== nextDocumentsVerified ||
      (rejectionReason || null) !== (nextReason || null),
  };
}
