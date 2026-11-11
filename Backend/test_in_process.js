/**
 * test_in_process.js
 * In-process unit & integration test verifying dynamic questions, custom reference answers,
 * and semantic grading logic without requiring network sockets.
 */

const assert = require('assert');

// Test the extractKeyConcepts and evaluateAnswer functions directly from local_proxy
const proxyCode = require('fs').readFileSync(__dirname + '/local_proxy.js', 'utf8');

// Extract the functions
const extractKeyConcepts = new Function('escapeRegExp', 
  proxyCode.slice(
    proxyCode.indexOf('function extractKeyConcepts'),
    proxyCode.indexOf('function evaluateAnswer')
  ) + '; return extractKeyConcepts;'
)(string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const evaluateAnswer = new Function('extractKeyConcepts',
  proxyCode.slice(
    proxyCode.indexOf('function evaluateAnswer'),
    proxyCode.indexOf('function extractPdfText')
  ) + '; return evaluateAnswer;'
)(extractKeyConcepts);

console.log("=== TEST 1: Key Concept Extraction from Reference Answer ===");
const refAnswer = "ACID transactions use Write-Ahead Logging (WAL) and Multi-Version Concurrency Control (MVCC) where row versions (xmin, xmax) prevent dirty reads. Optimistic locking uses a version column checked in UPDATE WHERE clauses.";
const qText = "Explain how ACID transactions and optimistic locking are implemented in PostgreSQL.";

const concepts = extractKeyConcepts(refAnswer, qText);
console.log(`Extracted ${concepts.length} key concepts:`);
concepts.slice(0, 8).forEach(c => console.log(`  - ${c.name}`));

assert(concepts.length >= 5, "Should extract at least 5 key concepts");
console.log("✓ Key concepts extracted successfully!");

console.log("\n=== TEST 2: Story / Off-Topic Answer Submission ===");
const storyAnswer = "Once upon a time in a magic kingdom, a young princess went to the park and had strawberry ice cream with her dragon friend.";
const evalStory = evaluateAnswer("custom_q_1", storyAnswer, qText, refAnswer, 10);
console.log("Story Evaluation:", evalStory);
assert.strictEqual(evalStory.marks_awarded, 0, "Story answer MUST get 0 marks");
assert(evalStory.feedback.includes("off-topic creative storytelling"), "Feedback should identify story");
console.log("✓ Story detection awarded 0/10 as expected!");

console.log("\n=== TEST 3: Strong Technical Answer Submission ===");
const strongAnswer = "PostgreSQL implements ACID transactions using Write-Ahead Logging (WAL) for durability and atomicity, along with Multi-Version Concurrency Control (MVCC) with row versions (xmin, xmax) to avoid dirty reads. Optimistic locking is handled using a version column in UPDATE queries with WHERE version = expected.";
const evalStrong = evaluateAnswer("custom_q_1", strongAnswer, qText, refAnswer, 10);
console.log("Strong Technical Evaluation:", evalStrong);
assert(evalStrong.marks_awarded >= 8, `Expected strong answer to get >= 8 marks, got ${evalStrong.marks_awarded}`);
console.log(`✓ Strong answer awarded ${evalStrong.marks_awarded}/10 matching reference criteria!`);

console.log("\n=== TEST 4: Partial Answer Submission ===");
const partialAnswer = "PostgreSQL uses transactions and locking mechanisms for updates.";
const evalPartial = evaluateAnswer("custom_q_1", partialAnswer, qText, refAnswer, 10);
console.log("Partial Technical Evaluation:", evalPartial);
assert(evalPartial.marks_awarded <= 5, "Partial answer should get proportional marks");
console.log(`✓ Partial answer awarded ${evalPartial.marks_awarded}/10!`);

console.log("\n=== TEST 5: Second Custom Question (Marks = 15) ===");
const q2Text = "Describe how you design an idempotent payment processing REST API to prevent duplicate charges.";
const q2Ref = "Use unique Idempotency-Key header stored in Redis/DB with atomic transaction status (processing, succeeded, failed) and distributed locks to deduplicate requests.";

const q2CandidateAnswer = "Clients include a unique Idempotency-Key header in payment requests. We store this key in Redis using distributed locks and track atomic transaction status (processing, succeeded, failed) to deduplicate requests and prevent duplicate charges.";
const evalQ2 = evaluateAnswer("custom_q_2", q2CandidateAnswer, q2Text, q2Ref, 15);
console.log("Q2 Evaluation (out of 15):", evalQ2);
assert(evalQ2.marks_awarded >= 12, `Expected Q2 to get >= 12/15 marks, got ${evalQ2.marks_awarded}`);
assert.strictEqual(evalQ2.max_marks, 15, "Max marks should be 15");
console.log(`✓ Custom question with 15 marks awarded ${evalQ2.marks_awarded}/15!`);

console.log("\n=== TEST 6: Completely Blank / Short Answer ===");
const evalShort = evaluateAnswer("custom_q_1", "idk", qText, refAnswer, 10);
console.log("Short Answer Evaluation:", evalShort);
assert.strictEqual(evalShort.marks_awarded, 0, "Short answer MUST get 0 marks");
console.log("✓ Short answer correctly awarded 0/10!");

console.log("\n=========================================");
console.log(">>> ALL IN-PROCESS UNIT TESTS PASSED! <<<");
console.log("=========================================");

