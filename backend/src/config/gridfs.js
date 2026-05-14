const mongoose = require('mongoose');
const { Readable } = require('stream');

let _bucket = null;

const getBucket = () => {
  if (!_bucket) {
    _bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'voice_recordings',
    });
  }
  return _bucket;
};

/**
 * Upload a Buffer to GridFS. Returns the file _id as a string.
 */
const uploadRecording = async (buffer, filename, contentType = 'audio/webm') => {
  const bucket = getBucket();
  const readable = Readable.from(buffer);
  const uploadStream = bucket.openUploadStream(filename, {
    contentType,
    metadata: { uploadedAt: new Date() },
  });
  await new Promise((resolve, reject) => {
    readable.pipe(uploadStream).on('finish', resolve).on('error', reject);
  });
  return uploadStream.id.toString();
};

/**
 * Stream a recording to an Express response (for playback/download).
 */
const streamRecording = async (fileId, res) => {
  const bucket = getBucket();
  const objectId = new mongoose.Types.ObjectId(fileId);
  const files = await bucket.find({ _id: objectId }).toArray();
  if (!files.length) {
    res.status(404).json({ success: false, message: 'Recording not found' });
    return;
  }
  res.set('Content-Type', files[0].contentType || 'audio/webm');
  bucket.openDownloadStream(objectId).pipe(res);
};

/**
 * Delete a recording from GridFS.
 */
const deleteRecording = async (fileId) => {
  try {
    const bucket = getBucket();
    await bucket.delete(new mongoose.Types.ObjectId(fileId));
  } catch (_) { /* ignore if already deleted */ }
};

module.exports = { uploadRecording, streamRecording, deleteRecording };
