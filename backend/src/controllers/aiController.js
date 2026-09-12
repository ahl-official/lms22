const axios = require('axios');

/**
 * @desc    Generate study notes from course transcript
 * @route   POST /api/ai/generate-notes
 * @access  Private (Trainee)
 */
exports.generateStudyNotes = async (req, res, next) => {
  try {
    const { courseTitle, transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ success: false, message: 'Transcript is required' });
    }

    const prompt = `You are a study assistant for an LMS. Given this course transcript, generate study materials.

Course: "${courseTitle}"
Transcript: """${transcript.slice(0, 6000)}"""

Return ONLY valid JSON (no markdown, no code fences):
{
  "summary": "2-3 sentence overview",
  "flashcards": [{"front": "question", "back": "answer"}],
  "diagrams": [{"title": "short title", "code": "valid mermaid code"}],
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"]
}

Rules:
- 6-8 flashcards, progressively harder
- First diagram must be a flowchart TD. Example format:
  flowchart TD\n  A[Topic] --> B[Point 1]\n  A --> C[Point 2]\n  B --> D[Detail]\n  C --> E[Detail]
- Second diagram must be a mindmap. Example format:
  mindmap\n  root((Topic))\n    Branch One\n      Detail A\n      Detail B\n    Branch Two\n      Detail C\n      Detail D
- Mindmap root MUST use double parentheses: root((Word))
- No semicolons anywhere in diagram code
- No quotes inside node labels
- Node labels must be under 20 characters
- Use \\n to separate lines within the code string`;

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: process.env.LLM_MODEL || 'openai/gpt-4o-mini',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      }
    });

    const raw = response.data.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    try {
      const notes = JSON.parse(clean);
      res.json({ success: true, notes });
    } catch (parseErr) {
      console.error('AI JSON Parse Error:', clean);
      res.status(500).json({ success: false, message: 'Failed to parse AI response' });
    }
  } catch (err) {
    console.error('AI Generation Error:', err.response?.data || err.message);
    next(err);
  }
};