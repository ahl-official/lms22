const { Pinecone } = require('@pinecone-database/pinecone');

let _pc = null;
let _index = null;

const getClient = () => {
  if (!_pc) _pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return _pc;
};

const getIndex = () => {
  if (!_index) _index = getClient().index(process.env.PINECONE_INDEX_NAME);
  return _index;
};

/**
 * Generate embeddings using Pinecone's own inference API.
 * Model: multilingual-e5-large → 1024 dimensions
 * Make sure your Pinecone index is set to 1024 dimensions.
 */
const generateEmbedding = async (text) => {
  const pc = getClient();
  const response = await pc.inference.embed(
    'multilingual-e5-large',
    [text.slice(0, 4096)],
    { inputType: 'passage', truncate: 'END' }
  );
  return response.data[0].values;
};

const upsertVoiceAttempt = async ({ id, embedding, metadata }) => {
  const index = getIndex();
  await index.upsert([{ id, values: embedding, metadata }]);
};

const querySimilarAttempts = async (embedding, topK = 5, filter = {}) => {
  const index = getIndex();
  const result = await index.query({ vector: embedding, topK, includeMetadata: true, filter });
  return result.matches || [];
};

const deleteVoiceAttempt = async (id) => {
  try {
    const index = getIndex();
    await index.deleteOne(id);
  } catch (_) { }
};

module.exports = { generateEmbedding, upsertVoiceAttempt, querySimilarAttempts, deleteVoiceAttempt };