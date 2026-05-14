// ─────────────────────────────────────────────────────────────────────────────
// ADD THESE METHODS TO YOUR EXISTING userController.js
// ─────────────────────────────────────────────────────────────────────────────

const User = require('../models/User');

/**
 * GET /users/:id/roles
 * Returns the roles array for a specific user.
 * Accessible by: admin (any user), trainer (trainees only)
 */
const getUserRoles = async (req, res) => {
    try {
        const target = await User.findById(req.params.id).select('name email roles role');
        if (!target) return res.status(404).json({ success: false, message: 'User not found' });

        // Trainer can only view trainee roles
        const actorRoles = req.user.roles || [req.user.role];
        if (!actorRoles.includes('admin')) {
            const targetRoles = target.roles || [target.role];
            const canManage = targetRoles.every((r) => req.allowedTargetRoles.includes(r));
            if (!canManage) {
                return res.status(403).json({ success: false, message: 'Access denied for this user' });
            }
        }

        res.json({ success: true, roles: target.roles, primaryRole: target.role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PUT /users/:id/roles
 * Replaces the user's roles array entirely.
 * Body: { roles: ['trainer', 'trainee'] }
 *
 * Permission rules (enforced by authorizeRoleManagement middleware):
 *   - Admin  → can set any combination of ['trainer', 'trainee'] roles,
 *              and can set ['admin'] role too
 *   - Trainer → can only set roles for trainees, and only trainee roles
 */
const updateUserRoles = async (req, res) => {
    try {
        const { roles } = req.body;

        if (!Array.isArray(roles) || roles.length === 0) {
            return res.status(400).json({ success: false, message: 'roles must be a non-empty array' });
        }

        const validRoles = ['admin', 'trainer', 'trainee'];
        const invalid = roles.filter((r) => !validRoles.includes(r));
        if (invalid.length) {
            return res.status(400).json({ success: false, message: `Invalid roles: ${invalid.join(', ')}` });
        }

        const target = await User.findById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: 'User not found' });

        const actorRoles = req.user.roles || [req.user.role];

        // Non-admins can only manage users whose CURRENT roles are all within allowedTargetRoles
        if (!actorRoles.includes('admin')) {
            const currentTargetRoles = target.roles || [target.role];
            const actorCanManageTarget = currentTargetRoles.every((r) =>
                req.allowedTargetRoles.includes(r)
            );
            if (!actorCanManageTarget) {
                return res.status(403).json({ success: false, message: 'You cannot manage this user' });
            }

            // Non-admins can only ASSIGN roles within their allowedTargetRoles
            const forbidden = roles.filter((r) => !req.allowedTargetRoles.includes(r));
            if (forbidden.length) {
                return res.status(403).json({
                    success: false,
                    message: `You are not allowed to assign: ${forbidden.join(', ')}`,
                });
            }
        }

        // Apply
        target.roles = roles;
        // role (legacy) is auto-synced to roles[0] in pre-save hook
        await target.save();

        res.json({
            success: true,
            message: 'Roles updated successfully',
            user: target.toPublic(),
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /users/:id/roles/add
 * Adds a single role to a user without removing existing ones.
 * Body: { role: 'trainer' }
 */
const addUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        const validRoles = ['admin', 'trainer', 'trainee'];

        if (!role || !validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: `Invalid role: ${role}` });
        }

        const target = await User.findById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: 'User not found' });

        const actorRoles = req.user.roles || [req.user.role];

        // Non-admins: check they can manage this target user
        if (!actorRoles.includes('admin')) {
            const currentTargetRoles = target.roles || [target.role];
            const actorCanManageTarget = currentTargetRoles.every((r) =>
                req.allowedTargetRoles.includes(r)
            );
            if (!actorCanManageTarget) {
                return res.status(403).json({ success: false, message: 'You cannot manage this user' });
            }
            if (!req.allowedTargetRoles.includes(role)) {
                return res.status(403).json({ success: false, message: `You cannot assign the role: ${role}` });
            }
        }

        if (target.roles.includes(role)) {
            return res.status(400).json({ success: false, message: `User already has role: ${role}` });
        }

        target.roles.push(role);
        await target.save();

        res.json({ success: true, message: `Role '${role}' added`, user: target.toPublic() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * DELETE /users/:id/roles/remove
 * Removes a single role from a user.
 * Body: { role: 'trainer' }
 */
const removeUserRole = async (req, res) => {
    try {
        const { role } = req.body;

        const target = await User.findById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: 'User not found' });

        const actorRoles = req.user.roles || [req.user.role];

        if (!actorRoles.includes('admin')) {
            const currentTargetRoles = target.roles || [target.role];
            const actorCanManageTarget = currentTargetRoles.every((r) =>
                req.allowedTargetRoles.includes(r)
            );
            if (!actorCanManageTarget) {
                return res.status(403).json({ success: false, message: 'You cannot manage this user' });
            }
            if (!req.allowedTargetRoles.includes(role)) {
                return res.status(403).json({ success: false, message: `You cannot remove the role: ${role}` });
            }
        }

        if (!target.roles.includes(role)) {
            return res.status(400).json({ success: false, message: `User does not have role: ${role}` });
        }

        if (target.roles.length === 1) {
            return res.status(400).json({ success: false, message: 'Cannot remove the only role — user must have at least one role' });
        }

        target.roles = target.roles.filter((r) => r !== role);
        await target.save();

        res.json({ success: true, message: `Role '${role}' removed`, user: target.toPublic() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { getUserRoles, updateUserRoles, addUserRole, removeUserRole };