const mongoose = require('mongoose');
const {
  ROLEPLAY_TYPE_VALUES,
  DEFAULT_ROLEPLAY_TYPE,
} = require('../constants/rolePlayTypes');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    // Controls how role-play scenarios are framed for courses in this category.
    roleplay_type: {
        type: String,
        enum: ROLEPLAY_TYPE_VALUES,
        default: DEFAULT_ROLEPLAY_TYPE,
    },
    is_active: {
        type: Boolean,
        default: true
    },
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);