// Run locally with GOOGLE_APPLICATION_CREDENTIALS pointing to a private service-account JSON.
// Never commit that JSON or share it in chat.
const admin = require('firebase-admin');
const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/set-admin-claim.js admin@example.com');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.applicationDefault() });
(async () => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
    console.log(`Granted admin claim to ${email}. Ask the user to sign out and sign in again.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await admin.app().delete();
  }
})();
