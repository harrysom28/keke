/**
 * Backward-compatible wrapper around createAdminUser.js.
 * With no args, creates the original admin@keke.com account.
 */
import { createAdminUser } from './createAdminUser.js';

const [, , name, email, password, role] = process.argv;
const defaults = !name && !email && !password;

createAdminUser(
  defaults
    ? undefined
    : { name, email, password, role: role || 'admin' }
).then((user) => {
  if (defaults && user) {
    console.log('🔑 Password: Admin@123456');
    console.log('You can now login to the admin dashboard!');
  }
  process.exit(0);
}).catch((error) => {
  console.error('❌ Error creating admin user:', error.message);
  process.exit(1);
});
