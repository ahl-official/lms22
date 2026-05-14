// backend/src/scripts/migrateModuleTestsToLessons.js
// Run once: node src/scripts/migrateModuleTestsToLessons.js
//
// What it does:
//   1. For each module that has tests, creates a default lesson if none exist
//   2. Links the test to that lesson (sets lesson_id on Test, sets test_id on Lesson)
//   3. Leaves module_id on the Test intact (backward-compat)
//   4. Skips tests that already have a lesson_id

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Module = require('../models/Module');
    const Lesson = require('../models/Lesson');
    const Test = require('../models/Test');

    // Find all tests that belong to a module but NOT yet to a lesson
    const tests = await Test.find({ module_id: { $ne: null }, lesson_id: null });
    console.log(`Found ${tests.length} tests to migrate`);

    let created = 0, linked = 0, skipped = 0;

    for (const test of tests) {
        const mod = await Module.findById(test.module_id);
        if (!mod) {
            console.warn(`  SKIP: module ${test.module_id} not found for test ${test._id}`);
            skipped++;
            continue;
        }

        // Check if lessons already exist for this module
        const existingLessons = await Lesson.find({ module_id: mod._id }).sort({ order: 1 });
        let targetLesson;

        if (existingLessons.length === 0) {
            // Create a default "Introduction" lesson for this module
            targetLesson = await Lesson.create({
                module_id: mod._id,
                course_id: mod.course_id,
                title: `${mod.title} — Introduction`,
                description: mod.description || '',
                video_url: mod.video_url || null,
                video_source: mod.video_source || 'unknown',
                transcript: mod.transcript || null,
                transcript_status: mod.transcript_status || 'none',
                order: 0,
                is_published: mod.is_published,
                created_by: mod.created_by,
            });
            created++;
            console.log(`  Created lesson for module "${mod.title}"`);
        } else {
            // Use the first lesson in the module
            targetLesson = existingLessons[0];
        }

        // Only link if the lesson doesn't already have a test
        if (!targetLesson.test_id) {
            test.lesson_id = targetLesson._id;
            await test.save();

            targetLesson.test_id = test._id;
            await targetLesson.save();

            linked++;
            console.log(`  Linked test "${test.title}" → lesson "${targetLesson.title}"`);
        } else {
            console.log(`  SKIP: lesson "${targetLesson.title}" already has a test`);
            skipped++;
        }
    }

    console.log('\n─── Migration complete ───');
    console.log(`  Lessons created : ${created}`);
    console.log(`  Tests linked    : ${linked}`);
    console.log(`  Skipped         : ${skipped}`);

    await mongoose.disconnect();
    process.exit(0);
}

run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});