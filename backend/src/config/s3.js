const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

const isR2 = !!process.env.R2_ACCOUNT_ID;

const s3Client = new S3Client(
  isR2
    ? {
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
        }
      }
    : {
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      }
);

const BUCKET = isR2 ? process.env.R2_BUCKET : process.env.AWS_S3_BUCKET;

/**
 * Upload a voice recording buffer to S3/R2
 */
const uploadVoiceRecording = async (buffer, mimeType = 'audio/webm') => {
  const key = `voice-recordings/${uuidv4()}.webm`;
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType
  }));
  return key;
};

/**
 * Generate a pre-signed URL for listening to a recording
 */
const getRecordingUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Delete a recording
 */
const deleteRecording = async (key) => {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
};

module.exports = { uploadVoiceRecording, getRecordingUrl, deleteRecording };
