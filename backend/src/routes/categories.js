const router = require('express').Router();
const Category = require('../models/Category');
const User = require('../models/User');
const Course = require('../models/Course');
const { authenticate, authorize } = require('../middleware/auth');
const {
    ROLEPLAY_TYPES,
    DEFAULT_ROLEPLAY_TYPE,
    isValidRolePlayType,
    normalizeRolePlayType,
} = require('../constants/rolePlayTypes');

// Count users in a category — checks both category_ids array and legacy category_id
const countInCategory = (catId, role) => User.countDocuments({
    $or: [{ category_ids: catId }, { category_id: catId }],
    role,
    is_active: { $ne: false },
});

// GET /api/categories
router.get('/', authenticate, async (req, res, next) => {
    try {
        const categories = await Category.find({ is_active: true }).sort({ name: 1 });
        const enriched = await Promise.all(
            categories.map(async (cat) => {
                const [trainer_count, trainee_count] = await Promise.all([
                    countInCategory(cat._id, 'trainer'),
                    countInCategory(cat._id, 'trainee'),
                ]);
                const obj = cat.toObject();
                return {
                    ...obj,
                    roleplay_type: normalizeRolePlayType(obj.roleplay_type),
                    trainer_count,
                    trainee_count,
                };
            })
        );
        res.json({ success: true, categories: enriched, roleplay_types: ROLEPLAY_TYPES });
    } catch (err) { next(err); }
});

// POST /api/categories
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
    try {
        const { name, description, roleplay_type } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
        if (roleplay_type != null && roleplay_type !== '' && !isValidRolePlayType(roleplay_type)) {
            return res.status(400).json({ success: false, message: 'Invalid role play type' });
        }
        const exists = await Category.findOne({ name: name.trim() });
        if (exists) return res.status(400).json({ success: false, message: 'Category already exists' });
        const category = await Category.create({
            name: name.trim(),
            description: description?.trim() || '',
            roleplay_type: normalizeRolePlayType(roleplay_type || DEFAULT_ROLEPLAY_TYPE),
            created_by: req.user._id,
        });
        res.status(201).json({
            success: true,
            category: { ...category.toObject(), trainer_count: 0, trainee_count: 0 },
        });
    } catch (err) { next(err); }
});

// POST /api/categories/migrate-courses
router.post('/migrate-courses', authenticate, authorize('admin'), async (req, res, next) => {
    try {
        const trainers = await User.find({ role: 'trainer', category_id: { $ne: null } });
        let updated = 0;
        for (const trainer of trainers) {
            const result = await Course.updateMany(
                { created_by: trainer._id, category_id: null },
                { $set: { category_id: trainer.category_id } }
            );
            updated += result.modifiedCount;
        }
        const stillNull = await Course.countDocuments({ category_id: null });
        res.json({
            success: true,
            message: `Migration complete. ${updated} courses updated. ${stillNull} courses still have no category.`,
            updated,
            still_unassigned: stillNull,
        });
    } catch (err) { next(err); }
});

// GET /api/categories/:id/members
router.get('/:id/members', authenticate, authorize('admin'), async (req, res, next) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        const members = await User.find({
            $or: [{ category_ids: req.params.id }, { category_id: req.params.id }],
            is_active: { $ne: false },
        }).select('-password').sort({ role: 1, name: 1 });
        const trainers = members.filter(m => m.role === 'trainer');
        const trainees = members.filter(m => m.role === 'trainee');
        res.json({ success: true, category, members, trainers, trainees });
    } catch (err) { next(err); }
});

// PUT /api/categories/:id
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
    try {
        const { name, description, is_active, roleplay_type } = req.body;
        if (name) {
            const exists = await Category.findOne({ name: name.trim(), _id: { $ne: req.params.id } });
            if (exists) return res.status(400).json({ success: false, message: 'Category name already exists' });
        }
        if (roleplay_type != null && roleplay_type !== '' && !isValidRolePlayType(roleplay_type)) {
            return res.status(400).json({ success: false, message: 'Invalid role play type' });
        }
        const category = await Category.findByIdAndUpdate(
            req.params.id,
            {
                ...(name && { name: name.trim() }),
                ...(description !== undefined && { description }),
                ...(is_active !== undefined && { is_active }),
                ...(roleplay_type !== undefined && {
                    roleplay_type: normalizeRolePlayType(roleplay_type || DEFAULT_ROLEPLAY_TYPE),
                }),
            },
            { new: true, runValidators: true }
        );
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        const [trainer_count, trainee_count] = await Promise.all([
            countInCategory(category._id, 'trainer'),
            countInCategory(category._id, 'trainee'),
        ]);
        res.json({
            success: true,
            category: {
                ...category.toObject(),
                roleplay_type: normalizeRolePlayType(category.roleplay_type),
                trainer_count,
                trainee_count,
            },
        });
    } catch (err) { next(err); }
});

// DELETE /api/categories/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        // Remove from both fields
        const { modifiedCount: userCount } = await User.updateMany(
            { $or: [{ category_ids: req.params.id }, { category_id: req.params.id }] },
            { $pull: { category_ids: req.params.id }, $set: { category_id: null } }
        );
        const { modifiedCount: courseCount } = await Course.updateMany(
            { category_id: req.params.id }, { category_id: null }
        );
        category.is_active = false;
        await category.save();
        res.json({
            success: true,
            message: `Category deactivated. ${userCount} user(s) and ${courseCount} course(s) unlinked.`,
        });
    } catch (err) { next(err); }
});

module.exports = router;