/**
 * Upload an existing .zip to the Chrome Web Store and publish.
 * Exits 0 without uploading when required env vars are missing.
 *
 * Env: CHROME_EXTENSION_ID, CHROME_CLIENT_ID, CHROME_CLIENT_SECRET,
 *      CHROME_REFRESH_TOKEN, CHROME_ZIP_PATH
 */
import fs from 'node:fs';
import process from 'node:process';
import chromeWebstoreUpload from 'chrome-webstore-upload';

function defined(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

const required = [
  'CHROME_EXTENSION_ID',
  'CHROME_CLIENT_ID',
  'CHROME_CLIENT_SECRET',
  'CHROME_REFRESH_TOKEN',
  'CHROME_ZIP_PATH'
];

const missing = required.filter((k) => !defined(k));
if (missing.length) {
  console.log('[publish-chrome] Skipping Chrome Web Store upload (missing env):', missing.join(', '));
  process.exit(0);
}

const zipPath = process.env.CHROME_ZIP_PATH;
if (!fs.existsSync(zipPath)) {
  console.error('[publish-chrome] Zip not found:', zipPath);
  process.exit(1);
}

const client = chromeWebstoreUpload({
  extensionId: process.env.CHROME_EXTENSION_ID,
  clientId: process.env.CHROME_CLIENT_ID,
  clientSecret: process.env.CHROME_CLIENT_SECRET,
  refreshToken: process.env.CHROME_REFRESH_TOKEN
});

const token = await client.fetchToken();
const zipStream = fs.createReadStream(zipPath);
const upload = await client.uploadExisting(zipStream, token, 120);
console.log('[publish-chrome] Upload:', upload);

const publish = await client.publish('default', token);
console.log('[publish-chrome] Publish:', publish);
