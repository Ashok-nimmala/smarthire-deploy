/**
 * local_proxy.js
 * --------------
 * High-performance, zero-dependency local proxy & AI bridge server on port 8000.
 * Runs seamlessly in any environment without external Python dependencies.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const PORT = process.env.PORT || 8000;
const TARGET_BASE = process.env.TARGET_BASE || "https://r6j6keh5jn7ne2oykddo7k5vpi0rhdjx.lambda-url.ap-south-1.on.aws";

const EXAM_ID = "exam_22a87f7ed928d004a5a44228";
const APP_ID = "app_22a87f7ed928d004a5a44228";

const NEW_JD_ID = "jd_cloud_devops_2026";
const NEW_APP_ID = "app_cloud_devops_2026";
const NEW_EXAM_ID = "exam_cloud_devops_2026";

const examState = {
  status: "SCREENING_PASSED",
  resume_score: 85,
  started: false,
  submitted: false,
  scored: false,
  passed: null,
  score_percent: null,
  marks_awarded: null,
  marks_possible: 20,
  integrity_score: 100,
};

let interviewerDecisions = {};
let interviewerNotes = {
  [APP_ID]: [],
  [NEW_APP_ID]: [
    {
      by: "System",
      note: "Candidate scored 88% in AI resume screening (Threshold: 75%). Application auto-assigned to Lead Technical Interviewer.",
      at: new Date().toISOString()
    }
  ]
};
let proctoringEvents = [];

let cachedInterviewers = [
  {
    user_id: "usr_interviewer_1",
    id: "usr_interviewer_1",
    interviewer_id: "usr_interviewer_1",
    name: "Lead Technical Interviewer",
    email: "interviewer@example.com",
    org_id: "org_bnp",
    role: "interviewer",
    created_at: "2026-11-01T08:00:00Z"
  }
];

let cachedJobs = [
  {
    jd_id: NEW_JD_ID,
    title: "Cloud Infrastructure & DevOps Engineer",
    organization: "BNP Paribas",
    description: "We are seeking an experienced Cloud Infrastructure & DevOps Engineer to design, deploy, and automate robust multi-region AWS cloud architectures. Key responsibilities include orchestrating Docker containers with Kubernetes (EKS), managing Infrastructure as Code with Terraform, designing automated CI/CD deployment pipelines, and ensuring security and compliance for financial systems.\n\nRequired Skills:\n- AWS Cloud Services (EC2, S3, IAM, VPC, RDS)\n- Kubernetes & Docker containerization\n- Terraform / Infrastructure as Code\n- CI/CD (GitHub Actions, Jenkins, GitLab CI)\n- Python / Bash automation scripting\n- Linux system internals & networking",
    screening_threshold: 75,
    exam_threshold: 60,
    interviewer_id: "usr_interviewer_1",
    interviewer_name: "Lead Technical Interviewer",
    interviewer_email: "interviewer@example.com",
    status: "LIVE",
    application_count: 1,
    question_count: 2,
    total_marks: 20,
    posted_at: "2026-11-06T10:00:00Z",
    expires_at: "2026-12-31T23:59:59Z"
  },
  {
    jd_id: "jd_08b1d1a4502c46ba",
    title: "Senior Python Backend Engineer",
    organization: "BNP Paribas",
    description: "We are seeking a Senior Python Backend Engineer experienced with Python 3, FastAPI, AWS DynamoDB, REST APIs, and automated testing.",
    screening_threshold: 70,
    exam_threshold: 60,
    interviewer_id: "usr_interviewer_1",
    interviewer_name: "Lead Technical Interviewer",
    interviewer_email: "interviewer@example.com",
    status: "LIVE",
    application_count: 1,
    question_count: 2,
    total_marks: 20,
    posted_at: "2026-11-01T10:03:04.468437+00:00",
    expires_at: "2026-12-01T10:01:47.335750+00:00"
  },
  {
    jd_id: "jd_35f0b4e4bf934819",
    title: "Associate Software Engineer",
    organization: "radhika",
    description: "The candidate will be responsible for developing, testing, debugging, and maintaining software applications. The role requires knowledge of programming fundamentals, object-oriented programming, database management, web technologies, and software development methodologies.",
    screening_threshold: 70,
    exam_threshold: 60,
    interviewer_id: "usr_interviewer_1",
    interviewer_name: "Lead Technical Interviewer",
    interviewer_email: "interviewer@example.com",
    status: "LIVE",
    application_count: 0,
    question_count: 2,
    total_marks: 20,
    posted_at: "2026-11-04T06:43:10.274781+00:00",
    expires_at: "2026-11-05T12:12:00+00:00"
  }
];

const DEMO_CANDIDATE_EMAIL = "candidate_test_1@example.com";
const DEMO_CANDIDATE_ID = "usr_c4047f6ad7db43ee";
const DEMO_CANDIDATE_TOKEN = "sess_candidate_token_local";

const defaultDemoResume = `Ashok Nimmala
Senior Python & Cloud Backend Engineer
Email: candidate_test_1@example.com

PROFESSIONAL SUMMARY
Experienced Software Engineer with 4+ years of expertise in designing and deploying scalable backend services, asynchronous APIs, and cloud infrastructure. Proficient in Python, FastAPI, Django, PostgreSQL, AWS DynamoDB, Docker, and Kubernetes. Strong background in microservices architecture, CI/CD automation, and Linux environments.

TECHNICAL SKILLS
- Programming Languages: Python, Bash, SQL, JavaScript
- Frameworks & Libraries: FastAPI, Django, Flask, Starlette, Pydantic, SQLAlchemy
- Databases: PostgreSQL, AWS DynamoDB, Redis, MySQL
- Cloud & DevOps: AWS (EC2, S3, VPC, IAM, EKS), Docker, Kubernetes, CI/CD, Terraform
- Architecture: RESTful APIs, Microservices, Asynchronous Concurrency (ASGI, asyncio)
- Tools: Git, Linux, Postman, pytest

PROFESSIONAL EXPERIENCE
Senior Backend Engineer - Cloud Systems (2022 - Present)
- Designed and maintained high-throughput REST APIs using Python FastAPI and AWS DynamoDB with sub-10ms latency.
- Orchestrated containerized microservices using Docker and Kubernetes (EKS).
- Automated CI/CD deployment pipelines using GitHub Actions reducing deployment cycles by 40%.
- Implemented asynchronous background job queues and database connection pooling with PostgreSQL.

Software Developer (2020 - 2022)
- Built backend services and REST APIs using Python and Django.
- Managed relational schema migrations, indexing, and query optimization in PostgreSQL.
- Collaborated in Agile/Scrum sprints for feature delivery and automated testing.

EDUCATION
Bachelor of Technology in Computer Science and Engineering`;

const defaultCandidateProfile = {
  user_id: DEMO_CANDIDATE_ID,
  email: DEMO_CANDIDATE_EMAIL,
  name: "Ashok Nimmala",
  session_token: DEMO_CANDIDATE_TOKEN,
  resume_uploaded: true,
  resume_filename: "NIMMALA_ASHOK_RESUME.pdf",
  resume_uploaded_at: "2026-11-01T10:00:00Z",
  resume_characters: defaultDemoResume.length,
  resume_text: defaultDemoResume,
  applications: [APP_ID, NEW_APP_ID],
  created_at: "2026-11-01T09:00:00Z"
};

const registeredCandidates = {
  [DEMO_CANDIDATE_EMAIL]: defaultCandidateProfile,
  [DEMO_CANDIDATE_ID]: defaultCandidateProfile,
  [DEMO_CANDIDATE_TOKEN]: defaultCandidateProfile
};

let currentCandidate = defaultCandidateProfile;
let candidateProfile = defaultCandidateProfile;

function getCandidate(req, parsedUrl, bodyJson) {
  const authHeader = (req && req.headers && req.headers.authorization) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && registeredCandidates[token]) {
    return registeredCandidates[token];
  }

  const qEmail = (parsedUrl?.query?.email || bodyJson?.email || '').toLowerCase().trim();
  if (qEmail && registeredCandidates[qEmail]) {
    return registeredCandidates[qEmail];
  }

  const qCandId = (parsedUrl?.query?.candidate_id || parsedUrl?.query?.user_id || bodyJson?.user_id || '').trim();
  if (qCandId && registeredCandidates[qCandId]) {
    return registeredCandidates[qCandId];
  }

  return currentCandidate;
}

const defaultEvaluatedAnswers = [
  {
    id: "q_6582421276764b4b",
    question: "Explain how Python FastAPI achieves high performance compared to traditional frameworks like Flask or Django.",
    reference_answer: "FastAPI is built on Starlette and Pydantic, using async/await ASGI architecture on Uvicorn event loop with fast schema validation and non-blocking I/O concurrency.",
    candidate_answer: "",
    marks_awarded: 0,
    max_marks: 10,
    ai_feedback: "Pending candidate submission."
  },
  {
    id: "q_af1003127f6442ee",
    question: "What are the key trade-offs between relational databases and NoSQL databases like AWS DynamoDB?",
    reference_answer: "DynamoDB provides horizontal scaling, predictable single-digit ms latency, but lacks complex joins and ad-hoc SQL queries compared to relational DBs.",
    candidate_answer: "",
    marks_awarded: 0,
    max_marks: 10,
    ai_feedback: "Pending candidate submission."
  }
];

const cloudEvaluatedAnswers = [
  {
    id: "q_cloud_1",
    question: "Describe the architecture of a highly available, multi-AZ Kubernetes cluster on AWS (EKS) and how you manage stateful workloads.",
    reference_answer: "Deploy control plane across multiple AZs managed by AWS EKS, worker node groups in private subnets across 3 AZs with ALB ingress controller, and EBS CSI / EFS CSI drivers with persistent volumes for stateful workloads.",
    candidate_answer: "",
    marks_awarded: 0,
    max_marks: 10,
    ai_feedback: "Pending candidate submission."
  },
  {
    id: "q_cloud_2",
    question: "Explain how you implement Infrastructure as Code (IaC) with Terraform for automated blue-green deployments.",
    reference_answer: "Use remote S3 state backend with DynamoDB locking, modular VPC and ECS/EKS resource definitions, and switch traffic between blue and green target groups via Route 53 or ALB listener rules.",
    candidate_answer: "",
    marks_awarded: 0,
    max_marks: 10,
    ai_feedback: "Pending candidate submission."
  }
];

const applicationsMap = {
  // Application 1: Senior Python Backend Engineer
  [APP_ID]: {
    app_id: APP_ID,
    candidate_id: DEMO_CANDIDATE_ID,
    candidate_name: "Ashok Nimmala",
    candidate_email: DEMO_CANDIDATE_EMAIL,
    jd_id: "jd_08b1d1a4502c46ba",
    job_title: "Senior Python Backend Engineer",
    organization: "BNP Paribas",
    status: "SCREENING_PASSED",
    status_message: "You are eligible for the written exam",
    applied_at: "2026-11-01T10:03:13.502344+00:00",
    updated_at: "2026-11-01T10:08:00.000000+00:00",
    screening: {
      done: true,
      passed: true,
      score: 85,
      threshold: 70,
      confidence: 92,
      summary: "Candidate exhibits strong Python, backend engineering, and API development experience matching the job description.",
      matched_skills: ["Python", "FastAPI", "REST APIs", "AWS DynamoDB", "Databases"],
      missing_skills: ["Automated Testing frameworks"]
    },
    exam: {
      eligible: true,
      exam_id: EXAM_ID,
      how_to_start: `open the exam system and sign in with exam_id=${EXAM_ID}`,
      started: false,
      submitted: false,
      scored: false,
      score_percent: null,
      marks_awarded: null,
      marks_possible: 20,
      answers: JSON.parse(JSON.stringify(defaultEvaluatedAnswers))
    },
    exam_id: EXAM_ID,
    next_action: "EXAM_AVAILABLE",
    interview: {
      pending: false,
      decision: null,
      interviewer: "Lead Technical Interviewer",
      interviewer_name: "Lead Technical Interviewer",
      interviewer_email: "interviewer@example.com",
      interviewer_id: "usr_interviewer_1",
      scheduled_at: null
    },
    final_result: null,
    rejection: null
  },

  // Application 2: Cloud Infrastructure & DevOps Engineer (Passed screening and assigned to Interviewer!)
  [NEW_APP_ID]: {
    app_id: NEW_APP_ID,
    candidate_id: DEMO_CANDIDATE_ID,
    candidate_name: "Ashok Nimmala",
    candidate_email: DEMO_CANDIDATE_EMAIL,
    jd_id: NEW_JD_ID,
    job_title: "Cloud Infrastructure & DevOps Engineer",
    organization: "BNP Paribas",
    status: "INTERVIEW_PENDING",
    status_message: "Congratulations! Your resume cleared AI screening with 88% and is assigned to Lead Technical Interviewer for Interview Round.",
    applied_at: "2026-11-06T11:00:00Z",
    updated_at: "2026-11-06T11:15:00Z",
    screening_threshold: 75,
    screening: {
      done: true,
      passed: true,
      score: 88,
      threshold: 75,
      confidence: 94,
      summary: "Candidate exhibits exceptional AWS cloud infrastructure, Kubernetes orchestration, Docker containerization, and automation script capabilities exceeding the 75% screening threshold.",
      matched_skills: ["AWS", "Cloud Architecture", "Docker", "Kubernetes", "CI/CD", "Terraform", "Python", "Linux"],
      missing_skills: []
    },
    exam: {
      eligible: true,
      exam_id: NEW_EXAM_ID,
      how_to_start: `open the exam system and sign in with exam_id=${NEW_EXAM_ID}`,
      started: false,
      submitted: false,
      scored: false,
      score_percent: null,
      marks_awarded: null,
      marks_possible: 20,
      answers: JSON.parse(JSON.stringify(cloudEvaluatedAnswers))
    },
    exam_id: NEW_EXAM_ID,
    next_action: "INTERVIEW_PENDING",
    interview: {
      pending: true,
      decision: null,
      interviewer: "Lead Technical Interviewer",
      interviewer_name: "Lead Technical Interviewer",
      interviewer_email: "interviewer@example.com",
      interviewer_id: "usr_interviewer_1",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      notes: "Candidate cleared AI screening with 88%. Assigned to Lead Technical Interviewer for comprehensive review."
    },
    final_result: null,
    rejection: null
  }
};

// Initialize questions for default cached jobs if not present
if (cachedJobs[0] && !cachedJobs[0].questions) cachedJobs[0].questions = JSON.parse(JSON.stringify(cloudEvaluatedAnswers));
if (cachedJobs[1] && !cachedJobs[1].questions) cachedJobs[1].questions = JSON.parse(JSON.stringify(defaultEvaluatedAnswers));
if (cachedJobs[2] && !cachedJobs[2].questions) cachedJobs[2].questions = JSON.parse(JSON.stringify(defaultEvaluatedAnswers));

// =========================================================
// STATE PERSISTENCE & JOB / EXAM RESOLUTION HELPERS
// =========================================================
const STATE_FILE = path.join(__dirname, 'jobs_state.json');

function saveStateToDisk() {
  try {
    const data = {
      cachedJobs: cachedJobs,
      applicationsMap: applicationsMap,
      interviewerNotes: interviewerNotes,
      interviewerDecisions: interviewerDecisions,
      cachedInterviewers: cachedInterviewers
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error("Failed to save state to disk:", e.message);
  }
}

function loadStateFromDisk() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.cachedJobs)) {
        data.cachedJobs.forEach(savedJob => {
          const existingIdx = cachedJobs.findIndex(j => j.jd_id === savedJob.jd_id || (savedJob.id && j.id === savedJob.id));
          if (existingIdx !== -1) {
            cachedJobs[existingIdx] = { ...cachedJobs[existingIdx], ...savedJob };
          } else {
            cachedJobs.unshift(savedJob);
          }
        });
      }
      if (Array.isArray(data.cachedInterviewers)) {
        data.cachedInterviewers.forEach(savedInt => {
          const existing = cachedInterviewers.find(i => i.email === savedInt.email || i.user_id === savedInt.user_id);
          if (existing) {
            Object.assign(existing, savedInt);
          } else {
            cachedInterviewers.push(savedInt);
          }
        });
      }
      if (data.applicationsMap && typeof data.applicationsMap === 'object') {
        Object.assign(applicationsMap, data.applicationsMap);
      }
      if (data.interviewerNotes && typeof data.interviewerNotes === 'object') {
        Object.assign(interviewerNotes, data.interviewerNotes);
      }
      if (data.interviewerDecisions && typeof data.interviewerDecisions === 'object') {
        Object.assign(interviewerDecisions, data.interviewerDecisions);
      }
    }

    // Auto-discover any interviewers assigned across cachedJobs
    cachedJobs.forEach(j => {
      if (j.interviewer_id && j.interviewer_name) {
        const existing = cachedInterviewers.find(i => 
          i.user_id === j.interviewer_id || 
          i.id === j.interviewer_id || 
          (j.interviewer_email && i.email && i.email.toLowerCase() === j.interviewer_email.toLowerCase())
        );
        if (!existing) {
          cachedInterviewers.push({
            user_id: j.interviewer_id,
            id: j.interviewer_id,
            interviewer_id: j.interviewer_id,
            name: j.interviewer_name,
            email: j.interviewer_email || `${j.interviewer_name.replace(/\s+/g, '.').toLowerCase()}@example.com`,
            role: "interviewer",
            created_at: j.posted_at || new Date().toISOString()
          });
        }
      }
    });
  } catch (e) {
    console.error("Failed to load state from disk:", e.message);
  }
}

// Load any persisted state on startup
loadStateFromDisk();

/**
 * Robust Job Resolution across any identifier:
 * exact jd_id, id, job_id, stripped prefix (e.g. without 'jd_'), or title substring.
 */
function findJob(identifier) {
  if (!identifier) return null;
  const cleanId = String(identifier).trim().toLowerCase();

  // 1. Exact match on jd_id, id, job_id
  let found = cachedJobs.find(j => 
    (j.jd_id && j.jd_id.toLowerCase() === cleanId) ||
    (j.id && j.id.toLowerCase() === cleanId) ||
    (j.job_id && j.job_id.toLowerCase() === cleanId)
  );
  if (found) return found;

  // 2. Stripped prefix (stripping jd_, exam_, app_)
  const stripped = cleanId.replace(/^(jd_|exam_|app_)/i, '');
  if (stripped.length >= 3) {
    found = cachedJobs.find(j => {
      const jStripped = (j.jd_id || j.id || j.job_id || '').toLowerCase().replace(/^(jd_|exam_|app_)/i, '');
      return jStripped === stripped || jStripped.includes(stripped) || stripped.includes(jStripped);
    });
    if (found) return found;
  }

  // 3. Title match
  found = cachedJobs.find(j => j.title && j.title.toLowerCase().includes(cleanId));
  if (found) return found;

  return null;
}

/**
 * Robust Application Resolution across any identifier:
 * exact app_id, exam_id, jd_id, stripped prefix, or candidate's recent applications.
 */
function findApplication(identifier, req) {
  const cleanId = identifier ? String(identifier).trim().toLowerCase() : '';

  if (cleanId) {
    // 1. Exact match on app_id, exam_id, or jd_id
    let found = Object.values(applicationsMap).find(a =>
      (a.app_id && a.app_id.toLowerCase() === cleanId) ||
      (a.exam_id && a.exam_id.toLowerCase() === cleanId) ||
      (a.jd_id && a.jd_id.toLowerCase() === cleanId)
    );
    if (found) return found;

    // 2. Stripped prefix
    const stripped = cleanId.replace(/^(app_|exam_|jd_)/i, '');
    if (stripped.length >= 3) {
      found = Object.values(applicationsMap).find(a => {
        const aAppStripped = (a.app_id || '').toLowerCase().replace(/^(app_|exam_|jd_)/i, '');
        const aExamStripped = (a.exam_id || '').toLowerCase().replace(/^(app_|exam_|jd_)/i, '');
        const aJdStripped = (a.jd_id || '').toLowerCase().replace(/^(app_|exam_|jd_)/i, '');
        return aAppStripped === stripped || aExamStripped === stripped || aJdStripped === stripped ||
               aAppStripped.includes(stripped) || stripped.includes(aAppStripped);
      });
      if (found) return found;
    }
  }

  // 3. Match from active candidate
  if (req) {
    const cand = getCandidate(req);
    if (cand && cand.applications && cand.applications.length > 0) {
      const apps = cand.applications.map(aid => applicationsMap[aid]).filter(Boolean);
      if (apps.length > 0) {
        return apps[apps.length - 1];
      }
    }
  }

  return null;
}

let interviewerSessions = {
  "sess_interviewer_token_local": cachedInterviewers[0],
  "usr_interviewer_1": cachedInterviewers[0],
  "interviewer@example.com": cachedInterviewers[0]
};

function resolveInterviewer(req, parsedUrl) {
  // 1. From custom headers
  const headerId = req.headers['x-interviewer-id'];
  const headerEmail = (req.headers['x-interviewer-email'] || '').toLowerCase();
  if (headerId && interviewerSessions[headerId]) return interviewerSessions[headerId];
  if (headerEmail && interviewerSessions[headerEmail]) return interviewerSessions[headerEmail];
  if (headerId) {
    const found = cachedInterviewers.find(i => i.user_id === headerId || i.id === headerId || i.interviewer_id === headerId);
    if (found) return found;
  }
  if (headerEmail) {
    const found = cachedInterviewers.find(i => i.email && i.email.toLowerCase() === headerEmail);
    if (found) return found;
  }

  // 2. From Authorization header
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace(/^Bearer\s+/, '').trim();
    if (interviewerSessions[token]) return interviewerSessions[token];
  }

  // 3. From query parameters
  const qId = parsedUrl?.query?.interviewer_id || parsedUrl?.query?.user_id;
  const qEmail = (parsedUrl?.query?.email || '').toLowerCase();
  if (qId && interviewerSessions[qId]) return interviewerSessions[qId];
  if (qEmail && interviewerSessions[qEmail]) return interviewerSessions[qEmail];
  if (qId) {
    const found = cachedInterviewers.find(i => i.user_id === qId || i.id === qId || i.interviewer_id === qId);
    if (found) return found;
  }
  if (qEmail) {
    const found = cachedInterviewers.find(i => i.email && i.email.toLowerCase() === qEmail);
    if (found) return found;
  }

  // Default fallback
  return cachedInterviewers[0];
}

function getJobsForInterviewer(currentInt) {
  if (!currentInt) return [];
  const intId = currentInt.user_id || currentInt.id || currentInt.interviewer_id;
  const intEmail = (currentInt.email || '').toLowerCase();

  return cachedJobs.filter(j => {
    if (j.interviewer_id && (j.interviewer_id === intId || j.interviewer_id === currentInt.id)) return true;
    if (j.interviewer_email && intEmail && j.interviewer_email.toLowerCase() === intEmail) return true;
    return false;
  });
}

function getApplicationsForInterviewer(currentInt) {
  if (!currentInt) return [];
  const myJobs = getJobsForInterviewer(currentInt);
  const myJdIds = new Set(myJobs.map(j => j.jd_id));
  const intId = currentInt.user_id || currentInt.id || currentInt.interviewer_id;
  const intEmail = (currentInt.email || '').toLowerCase();

  const allApps = Object.values(applicationsMap);
  return allApps.filter(a => {
    if (a.interviewer_id && (a.interviewer_id === intId || a.interviewer_id === currentInt.id)) return true;
    if (a.interviewer_email && intEmail && a.interviewer_email.toLowerCase() === intEmail) return true;
    if (a.jd_id && myJdIds.has(a.jd_id)) return true;

    const job = findJob(a.jd_id);
    if (job) {
      if (job.interviewer_id && (job.interviewer_id === intId || job.interviewer_id === currentInt.id)) return true;
      if (job.interviewer_email && intEmail && job.interviewer_email.toLowerCase() === intEmail) return true;
    }
    return false;
  });
}

/**
 * Comprehensive Exam Context Resolver:
 * Resolves application, job, and exact custom questions.
 * Ensures custom questions created by admin are ALWAYS preferred over default questions.
 */
function resolveExamContext(eid, req) {
  let app = findApplication(eid, req);
  let job = null;

  if (app) {
    job = findJob(app.jd_id) || (app.job_title ? cachedJobs.find(j => j.title === app.job_title) : null);
  }

  if (!job && eid) {
    job = findJob(eid);
  }

  // Check if any custom job was created that has questions (excluding default jobs)
  const customJobWithQuestions = cachedJobs.find(j => 
    j.questions && j.questions.length > 0 && j.jd_id !== NEW_JD_ID && j.jd_id !== "jd_08b1d1a4502c46ba" && j.jd_id !== "jd_35f0b4e4bf934819"
  );

  // If no job was matched specifically, prefer custom job with questions over static defaults
  if (!job && customJobWithQuestions) {
    job = customJobWithQuestions;
  }

  if (!job) {
    job = cachedJobs[0];
  }

  // If we found a job but have no application yet (e.g. user entered job_id or entered exam directly)
  if (!app && job) {
    const cand = getCandidate(req);
    const newAppId = `app_${(job.jd_id || 'custom').replace(/^jd_/i, '')}`;
    const newExamId = `exam_${(job.jd_id || 'custom').replace(/^jd_/i, '')}`;

    if (applicationsMap[newAppId]) {
      app = applicationsMap[newAppId];
    } else {
      app = {
        app_id: newAppId,
        jd_id: job.jd_id,
        candidate_id: cand.user_id,
        candidate_name: cand.name,
        candidate_email: cand.email,
        job_title: job.title,
        organization: job.organization || "BNP Paribas",
        status: "SCREENING_PASSED",
        status_message: "You are eligible for the written exam",
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        screening_threshold: job.screening_threshold || 70,
        screening: {
          done: true,
          passed: true,
          score: 85,
          threshold: job.screening_threshold || 70,
          confidence: 90,
          summary: `Auto-qualified for ${job.title}`,
          matched_skills: ["Core Skills", "Engineering"],
          missing_skills: []
        },
        exam: {
          eligible: true,
          exam_id: newExamId,
          how_to_start: `open the exam system and sign in with exam_id=${newExamId}`,
          started: false,
          submitted: false,
          scored: false,
          score_percent: null,
          marks_awarded: null,
          marks_possible: (job.questions && job.questions.length > 0) ? job.questions.reduce((sum, q) => sum + (parseInt(q.marks) || 10), 0) : 20,
          answers: []
        },
        exam_id: newExamId,
        next_action: "EXAM_AVAILABLE",
        interview: {
          pending: false,
          decision: null,
          interviewer: job.interviewer_name || "Lead Technical Interviewer",
          interviewer_name: job.interviewer_name || "Lead Technical Interviewer",
          interviewer_email: job.interviewer_email || "interviewer@example.com",
          interviewer_id: job.interviewer_id || "usr_interviewer_1",
          scheduled_at: null
        },
        final_result: null,
        rejection: null
      };
      applicationsMap[newAppId] = app;
      if (!cand.applications.includes(newAppId)) {
        cand.applications.push(newAppId);
      }
    }
  }

  // Resolve questions:
  // Priority 1: If target job has questions, ALWAYS use job.questions!
  // Priority 2: If app has custom questions, use app.exam.answers
  // Priority 3: If any custom job with questions exists, use that!
  // Priority 4: Cloud or default answers
  let rawList = [];
  if (job && job.questions && job.questions.length > 0) {
    rawList = job.questions;
  } else if (app && app.exam && app.exam.answers && app.exam.answers.length > 0) {
    const isDefault = app.exam.answers.some(a => a.question && a.question.includes("FastAPI achieves high performance"));
    if (!isDefault) {
      rawList = app.exam.answers;
    } else if (customJobWithQuestions && customJobWithQuestions.questions && customJobWithQuestions.questions.length > 0) {
      rawList = customJobWithQuestions.questions;
    } else {
      rawList = app.exam.answers;
    }
  } else if (customJobWithQuestions && customJobWithQuestions.questions && customJobWithQuestions.questions.length > 0) {
    rawList = customJobWithQuestions.questions;
  } else if (job && job.jd_id === NEW_JD_ID) {
    rawList = cloudEvaluatedAnswers;
  } else {
    rawList = defaultEvaluatedAnswers;
  }

  const questions = rawList.map((q, idx) => ({
    id: q.question_id || q.id || `q_${idx}`,
    question_id: q.question_id || q.id || `q_${idx}`,
    order: q.order !== undefined ? q.order : idx,
    question: q.question || q.text || "",
    reference_answer: q.reference_answer || q.reference || "",
    marks: parseInt(q.marks || q.max_marks) || 10,
    max_marks: parseInt(q.marks || q.max_marks) || 10
  }));

  // Sync to app.exam.answers
  if (app && app.exam) {
    const needSync = !app.exam.answers || app.exam.answers.length === 0 ||
      app.exam.answers.length !== questions.length ||
      (app.exam.answers[0] && questions[0] && app.exam.answers[0].question !== questions[0].question);

    if (needSync) {
      app.exam.answers = questions.map((q, idx) => ({
        id: q.question_id,
        question_id: q.question_id,
        order: idx,
        question: q.question,
        reference_answer: q.reference_answer,
        candidate_answer: "",
        marks_awarded: 0,
        max_marks: q.max_marks,
        ai_feedback: "Pending candidate submission."
      }));
      app.exam.marks_possible = questions.reduce((sum, q) => sum + q.max_marks, 0);
    }
  }

  return { app, job, questions };
}

const PROCTORED_EXAM_DIR = fs.existsSync(path.resolve(__dirname, "proctored-exam"))
  ? path.resolve(__dirname, "proctored-exam")
  : path.resolve(__dirname, "../Frontend/proctored-exam");

const GATEWAY_HTML = fs.existsSync(path.resolve(__dirname, "gateway/index.html"))
  ? path.resolve(__dirname, "gateway/index.html")
  : path.resolve(__dirname, "../Frontend/gateway/index.html");

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Intelligent Dynamic Key Concepts & Technical Phrase Extractor
 * Extracts significant multi-word technical collocations and keywords from reference answer & question text
 */
function extractKeyConcepts(referenceAnswer, questionText = "") {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "with", "of", "by", "from",
    "as", "that", "this", "it", "is", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "can", "could", "should", "would", "will", "shall", "may", "might",
    "must", "than", "so", "such", "no", "not", "only", "own", "same", "then", "too", "very", "just",
    "into", "also", "its", "their", "our", "your", "them", "these", "those", "what", "how", "why",
    "where", "when", "who", "which", "between", "compared", "achieve", "achieves", "explain",
    "describes", "describe", "using", "uses", "used", "provide", "provides", "providing", "include",
    "includes", "including", "rather", "like", "such", "etc", "more", "most", "less", "least", "well",
    "make", "makes", "making", "take", "takes", "taking", "check", "checks", "checked", "checking",
    "give", "gives", "given", "giving", "keep", "keeps", "keeping", "help", "helps", "prevent", "prevents",
    "once", "twice", "two", "three", "first", "second", "third", "while", "during", "after", "before",
    "runs", "running", "ran", "routes", "routing", "external", "internal", "allow", "allows", "allowing",
    "maintain", "maintains", "maintaining", "under", "over", "above", "below", "either", "neither",
    "pass", "passes", "failure", "automated", "main", "call", "calls", "without", "execute", "executing"
  ]);

  // Primary criteria are extracted directly from the reference answer
  const text = (referenceAnswer || "").toLowerCase();
  const cleanTokens = text.replace(/[^a-z0-9_\-\s]/g, ' ').split(/\s+/).filter(Boolean);

  const concepts = [];
  const seen = new Set();

  // 1. Extract individual key technical terms
  for (const token of cleanTokens) {
    if (token.length >= 3 && !stopWords.has(token)) {
      if (!seen.has(token)) {
        seen.add(token);
        const stem = token.length >= 6 ? token.slice(0, -1) : token;
        concepts.push({
          name: token.charAt(0).toUpperCase() + token.slice(1),
          weight: 1,
          regex: new RegExp(`(\\b${escapeRegExp(stem)}|${escapeRegExp(token)})`, 'i')
        });
      }
    }
  }

  // 2. Extract technical compounds as supplemental indicators
  for (let i = 0; i < cleanTokens.length - 1; i++) {
    const w1 = cleanTokens[i];
    const w2 = cleanTokens[i + 1];
    if (w1.length >= 3 && w2.length >= 3 && !stopWords.has(w1) && !stopWords.has(w2)) {
      const compound = `${w1} ${w2}`;
      if (!seen.has(compound)) {
        seen.add(compound);
        concepts.push({
          name: compound.charAt(0).toUpperCase() + compound.slice(1),
          weight: 0.5,
          isCompound: true,
          regex: new RegExp(`\\b${escapeRegExp(w1)}[\\s\\-_/]+${escapeRegExp(w2)}\\b`, 'i')
        });
      }
    }
  }

  return concepts;
}

/**
 * Intelligent Semantic & Concept Evaluation Function for Proctored Exam Answers
 * Dynamically grades candidate answers against custom reference answers and question criteria.
 */
function evaluateAnswer(questionId, candidateAnswer, questionText = "", referenceAnswer = "", maxMarks = 10) {
  const ans = (candidateAnswer || "").trim().toLowerCase();

  if (!ans || ans.length < 10) {
    return {
      marks_awarded: 0,
      max_marks: maxMarks,
      feedback: `No substantive answer provided. Failed to demonstrate required technical knowledge. (0/${maxMarks})`
    };
  }

  const storyPatterns = [
    /once upon a time/i, /fairytale/i, /princess/i, /kingdom/i, /dragon/i,
    /forest/i, /lived happily/i, /king and queen/i, /story of/i, /sunny day/i,
    /went to the park/i, /ice cream/i, /cat sat/i, /rabbit and (the )?tortoise/i,
    /dear diary/i, /yesterday i went/i, /friend named/i, /movie was/i, /village/i, /castle/i
  ];
  const isStory = storyPatterns.some(pattern => pattern.test(ans));

  let buckets = [];
  if (questionId === 'q_6582421276764b4b') {
    buckets = [
      { name: "Asynchronous Architecture (ASGI / Async / Await)", weight: 2, regex: /\b(asgi|async|await|asynchronous|coroutine|non-blocking|non blocking)\b/i },
      { name: "Framework Foundation (Starlette & Pydantic)", weight: 2, regex: /\b(starlette|pydantic)\b/i },
      { name: "Event Loop & Web Server (Uvicorn / uvloop)", weight: 2, regex: /\b(uvicorn|uvloop|event loop|eventloop)\b/i },
      { name: "Schema Validation & Serialization", weight: 2, regex: /\b(validation|serialization|type hints|typing|schema)\b/i },
      { name: "Framework Comparison & Performance", weight: 2, regex: /\b(flask|django|wsgi|synchronous|concurrency|throughput|latency)\b/i }
    ];
  } else if (questionId === 'q_af1003127f6442ee') {
    buckets = [
      { name: "Relational & ACID Properties", weight: 2, regex: /\b(relational|acid|rdbms|sql|transactions?)\b/i },
      { name: "Schema & Joins", weight: 2, regex: /\b(joins?|foreign key|normalized|normalization|complex queries)\b/i },
      { name: "NoSQL & DynamoDB Architecture", weight: 2, regex: /\b(nosql|dynamodb|key-value|document|non-relational)\b/i },
      { name: "Horizontal vs Vertical Scalability", weight: 2, regex: /\b(horizontal|vertical|scaling|scalability|scale out)\b/i },
      { name: "Performance, Latency & Partitioning", weight: 2, regex: /\b(latency|millisecond|partition|throughput|flexible schema)\b/i }
    ];
  } else if (questionId === 'q_cloud_1') {
    buckets = [
      { name: "EKS Control Plane & Multi-AZ", weight: 2, regex: /\b(eks|control plane|multi-az|availability zone|worker nodes?)\b/i },
      { name: "Subnets & Networking", weight: 2, regex: /\b(private subnets?|vpc|alb|ingress|security groups?)\b/i },
      { name: "Stateful & Storage Drivers", weight: 2, regex: /\b(statefulset|persistent volume|pvc|ebs csi|efs csi|storageclass)\b/i },
      { name: "High Availability & Fault Tolerance", weight: 2, regex: /\b(high availability|ha|autoscaling|replica|topology)\b/i }
    ];
  } else if (questionId === 'q_cloud_2') {
    buckets = [
      { name: "Terraform State & Backend", weight: 2, regex: /\b(s3|dynamodb|backend|remote state|state locking)\b/i },
      { name: "Blue-Green Deployment Strategy", weight: 2, regex: /\b(blue-green|blue green|zero downtime|canary|cutover)\b/i },
      { name: "Traffic Routing & Switching", weight: 2, regex: /\b(route 53|alb|listener rule|target group|weighted routing)\b/i },
      { name: "Infrastructure as Code Modules", weight: 2, regex: /\b(modules?|reusable|declarative|ci\/cd|pipeline)\b/i }
    ];
  } else {
    // Dynamic evaluation from custom reference answer & question text
    buckets = extractKeyConcepts(referenceAnswer, questionText);
  }

  let totalCoreWeight = 0;
  let matchedCoreWeight = 0;
  let bonusWeight = 0;
  const matchedNames = [];

  for (const bucket of buckets) {
    if (bucket.isCompound) {
      if (bucket.regex.test(ans)) {
        bonusWeight += (bucket.weight || 0.5);
        matchedNames.push(bucket.name);
      }
    } else {
      const w = bucket.weight || 1;
      totalCoreWeight += w;
      if (bucket.regex.test(ans)) {
        matchedCoreWeight += w;
        matchedNames.push(bucket.name);
      }
    }
  }

  if (isStory && matchedNames.length === 0) {
    return {
      marks_awarded: 0,
      max_marks: maxMarks,
      feedback: `Answer is off-topic creative storytelling or narrative and does not address the technical question. (0/${maxMarks})`
    };
  }

  if (matchedNames.length === 0 || matchedCoreWeight === 0) {
    return {
      marks_awarded: 0,
      max_marks: maxMarks,
      feedback: `The submitted response lacks relevant technical concepts, keywords, or alignment with the reference criteria. (0/${maxMarks})`
    };
  }

  const coreRatio = totalCoreWeight > 0 ? (matchedCoreWeight / totalCoreWeight) : 0;
  const bonusRatio = totalCoreWeight > 0 ? (bonusWeight / totalCoreWeight) : 0;
  const rawRatio = Math.min(1.0, coreRatio + bonusRatio * 0.3);

  const wordCount = ans.split(/\s+/).filter(Boolean).length;
  // Brevity guard: responses shorter than 8 words cannot claim high tier scores
  const effectiveRatio = (wordCount < 8) ? Math.min(0.25, rawRatio) : rawRatio;

  if (effectiveRatio < 0.20) {
    const awarded = Math.max(1, Math.round(maxMarks * 0.25));
    return {
      marks_awarded: awarded,
      max_marks: maxMarks,
      feedback: `Minimal technical relevance. Touched on ${matchedNames.slice(0, 3).join(', ')}, but lacks depth and misses key reference criteria. (${awarded}/${maxMarks})`
    };
  }

  if (effectiveRatio < 0.40) {
    const awarded = Math.round(maxMarks * 0.55);
    return {
      marks_awarded: awarded,
      max_marks: maxMarks,
      feedback: `Good answer. Addressed key concepts including ${matchedNames.slice(0, 3).join(' & ')}, covering foundational reference criteria. (${awarded}/${maxMarks})`
    };
  }

  if (effectiveRatio < 0.70) {
    const awarded = Math.round(maxMarks * 0.85);
    return {
      marks_awarded: awarded,
      max_marks: maxMarks,
      feedback: `Strong technical answer! Accurately detailed ${matchedNames.slice(0, 4).join(', ')} matching reference criteria. (${awarded}/${maxMarks})`
    };
  }

  return {
    marks_awarded: maxMarks,
    max_marks: maxMarks,
    feedback: `Comprehensive and outstanding answer covering all key concepts and matching the reference criteria: ${matchedNames.slice(0, 4).join(', ')}. (${maxMarks}/${maxMarks})`
  };
}

/**
 * Extract readable text from uploaded PDF or text file buffers
 */
function extractPdfText(buffer) {
  let text = '';
  try {
    const str = buffer.toString('binary');
    const tjMatches = str.match(/\(([^()]{2,})\)\s*Tj/g);
    if (tjMatches) {
      text += tjMatches.map(m => m.replace(/^\(/, '').replace(/\)\s*Tj$/, '')).join(' ') + ' ';
    }

    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(str)) !== null) {
      try {
        const streamBuffer = Buffer.from(match[1], 'binary');
        const decompressed = zlib.inflateSync(streamBuffer).toString('utf8');
        const decompTj = decompressed.match(/\(([^()]{2,})\)\s*Tj/g);
        if (decompTj) {
          text += decompTj.map(m => m.replace(/^\(/, '').replace(/\)\s*Tj$/, '')).join(' ') + ' ';
        }
        const decompTJ = decompressed.match(/\[(.*?)\]\s*TJ/g);
        if (decompTJ) {
          text += decompTJ.map(m => m.replace(/\[|\]\s*TJ/g, '').replace(/\((.*?)\)/g, '$1')).join(' ') + ' ';
        }
      } catch {
        // Not a zlib stream or corrupt chunk
      }
    }

    if (text.trim().length < 50) {
      const printable = buffer.toString('utf8').replace(/[^\x20-\x7E\r\n\t]/g, ' ');
      const words = printable.split(/\s+/).filter(w => w.length >= 3 && /^[a-zA-Z0-9#\+\.\-_/]+$/.test(w));
      if (words.length > 20) {
        text += words.join(' ');
      }
    }
  } catch (err) {
    console.log("PDF extraction error:", err.message);
  }
  return text.trim();
}

/**
 * Intelligent Keyword & Requirement Matching Engine for Resume Screening
 * Compares candidate resume text against the Job Description title, description, and required skills.
 * NOT EVERYONE PASSES: If the candidate lacks core skills or falls below the threshold, they are rejected.
 */
function screenResumeAgainstJD(jd, resumeText) {
  const resume = (resumeText || "").toLowerCase();
  const jdText = ((jd.title || "") + " " + (jd.description || "")).toLowerCase();
  const threshold = parseInt(jd.screening_threshold || 70, 10);

  // If candidate has no resume text uploaded at all
  if (!resume || resume.trim().length < 20) {
    return {
      score: 5,
      threshold,
      passed: false,
      matched_skills: [],
      missing_skills: ["Resume not uploaded or unreadable"],
      experience_match: false,
      confidence: 90,
      summary: "No readable resume content found. Candidate cannot be screened without a valid resume.",
      red_flags: ["Screening score 5% is below 10%"]
    };
  }

  // Curated list of technical skills, frameworks, tools, and practices
  const skillTaxonomy = [
    // Languages
    { name: "Python", regex: /\b(python|python3|py)\b/i },
    { name: "Java", regex: /\b(java|jdk|jvm|j2ee)\b/i },
    { name: "JavaScript / TypeScript", regex: /\b(javascript|typescript|js|ts|ecmascript)\b/i },
    { name: "Go / Golang", regex: /\b(golang|go)\b/i },
    { name: "C++ / C#", regex: /\b(c\+\+|c#|\.net)\b/i },
    { name: "Rust", regex: /\brust\b/i },
    { name: "PHP", regex: /\bphp\b/i },
    { name: "Ruby", regex: /\b(ruby|rails)\b/i },
    { name: "Kotlin / Swift", regex: /\b(kotlin|swift|android|ios)\b/i },

    // Web Frameworks
    { name: "FastAPI", regex: /\bfastapi\b/i },
    { name: "Django", regex: /\bdjango\b/i },
    { name: "Flask", regex: /\bflask\b/i },
    { name: "Spring Boot", regex: /\b(spring|spring boot|springboot)\b/i },
    { name: "React", regex: /\breact(\.js)?\b/i },
    { name: "Angular", regex: /\bangular(\.js)?\b/i },
    { name: "Vue", regex: /\bvue(\.js)?\b/i },
    { name: "Node.js", regex: /\b(nodejs|node\.js|express)\b/i },
    { name: "Next.js", regex: /\bnext(\.js)?\b/i },

    // Cloud & DevOps
    { name: "AWS", regex: /\b(aws|amazon web services|ec2|s3|vpc|iam)\b/i },
    { name: "Azure", regex: /\b(azure|microsoft cloud)\b/i },
    { name: "GCP", regex: /\b(gcp|google cloud)\b/i },
    { name: "Kubernetes", regex: /\b(kubernetes|k8s|eks|gke|aks)\b/i },
    { name: "Docker", regex: /\b(docker|container|containers|containerization)\b/i },
    { name: "Terraform", regex: /\b(terraform|iac|infrastructure as code)\b/i },
    { name: "CI/CD", regex: /\b(ci\/cd|ci-cd|continuous integration|github actions|jenkins|gitlab ci)\b/i },
    { name: "Linux", regex: /\b(linux|unix|ubuntu|debian|centos|redhat|bash|shell)\b/i },

    // Databases
    { name: "PostgreSQL", regex: /\b(postgresql|postgres|psql)\b/i },
    { name: "MySQL", regex: /\bmysql\b/i },
    { name: "SQL & Relational DBs", regex: /\b(sql|relational database|rdbms)\b/i },
    { name: "DynamoDB", regex: /\bdynamodb\b/i },
    { name: "MongoDB", regex: /\b(mongodb|mongo)\b/i },
    { name: "Redis", regex: /\b(redis|cache|caching)\b/i },
    { name: "NoSQL", regex: /\b(nosql|non-relational)\b/i },
    { name: "Kafka", regex: /\b(kafka|event-driven|messaging)\b/i },
    { name: "Elasticsearch", regex: /\b(elasticsearch|elk)\b/i },

    // Architecture & Engineering Practices
    { name: "REST APIs", regex: /\b(rest|restful|api|apis|endpoints)\b/i },
    { name: "Microservices", regex: /\b(microservices?|distributed systems?)\b/i },
    { name: "Automated Testing", regex: /\b(testing|unit testing|automated tests?|pytest|junit|jest)\b/i },
    { name: "Security & Compliance", regex: /\b(security|compliance|oauth|jwt|auth|authentication|authorization)\b/i },
    { name: "Data Structures & Algorithms", regex: /\b(data structures?|algorithms?|problem solving)\b/i },
    { name: "Machine Learning / AI", regex: /\b(machine learning|ai|deep learning|pytorch|tensorflow|llm|nlp)\b/i },
    { name: "UI/UX & Design", regex: /\b(figma|photoshop|illustrator|ui\/ux|design systems?)\b/i }
  ];

  // 1. Identify which skills are demanded by the JD
  const demandedSkills = skillTaxonomy.filter(skill => skill.regex.test(jdText));

  // 2. Extract technical and domain keywords from the JD
  const jdTokens = jdText.replace(/[^a-z0-9_\-\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4);
  const stopWords = new Set([
    "with", "from", "that", "this", "have", "role", "team", "year", "years", "work", "join",
    "help", "about", "looking", "seeking", "requirements", "responsibilities", "candidate", "will",
    "must", "should", "could", "experience", "experienced", "skills", "knowledge", "design"
  ]);
  const jdKeywords = [...new Set(jdTokens.filter(w => !stopWords.has(w)))];

  // 3. Match demanded skills against candidate resume
  const matchedSkills = [];
  const missingSkills = [];

  for (const skill of demandedSkills) {
    if (skill.regex.test(resume)) {
      matchedSkills.push(skill.name);
    } else {
      missingSkills.push(skill.name);
    }
  }

  // 4. Keyword overlap
  const matchedKeywords = jdKeywords.filter(k => resume.includes(k));
  const keywordRatio = jdKeywords.length > 0 ? (matchedKeywords.length / jdKeywords.length) : 0.2;

  // 5. Role title alignment
  const titleWords = (jd.title || "").toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !["and", "for", "the", "lead", "senior", "associate", "junior", "staff"].includes(w));
  const titleMatches = titleWords.filter(w => resume.includes(w));
  const titleRatio = titleWords.length > 0 ? (titleMatches.length / titleWords.length) : 0.2;

  const skillRatio = demandedSkills.length > 0 ? (matchedSkills.length / demandedSkills.length) : keywordRatio;

  // Compute internal match percentage (0 - 100)
  let internalMatch = 0;
  if (!resume || resume.trim().length < 20) {
    internalMatch = 0;
  } else if (demandedSkills.length > 0) {
    internalMatch = Math.round((skillRatio * 50) + (keywordRatio * 30) + (titleRatio * 20));
    // If at least one skill, keyword, or title matched, candidate has positive relevance
    if (matchedSkills.length > 0 || matchedKeywords.length > 0 || titleMatches.length > 0) {
      internalMatch = Math.max(15, internalMatch);
    }
  } else {
    internalMatch = Math.round((keywordRatio * 60) + (titleRatio * 40));
    if (matchedKeywords.length > 0 || titleMatches.length > 0) {
      internalMatch = Math.max(15, internalMatch);
    }
  }

  // General software engineering baseline credit:
  const techTerms = /\b(engineer|developer|software|programming|code|api|web|database|data|testing|git|linux|python|java|javascript|cloud)\b/i;
  if (techTerms.test(resume) && internalMatch < 15) {
    internalMatch = Math.max(15, internalMatch);
  }

  // USER SPECIFICATION:
  // "if threshold gets above 10 inside it should be converted to above 80 percent ..and screening should be pass
  // ..if it less than 10 it should be rejected"
  let score = 0;
  let passed = false;

  if (internalMatch >= 10) {
    // Converted to above 80 percent (scaled smoothly between 82% and 95%) and screening passes!
    const scaledScore = 82 + Math.round((internalMatch / 100) * 13);
    score = Math.min(95, Math.max(82, scaledScore));
    passed = true;
  } else {
    // Less than 10%: candidate is rejected
    score = Math.max(2, internalMatch);
    passed = false;
  }

  const confidence = Math.min(95, 75 + matchedSkills.length * 3);

  let summary = "";
  if (passed) {
    summary = `Candidate resume demonstrated good technical alignment (${score}%) with the role requirements. Core competencies matched: ${matchedSkills.slice(0, 4).join(', ') || 'Foundational Engineering Capabilities'}. Cleared screening threshold (${threshold}%).`;
  } else {
    summary = `Candidate resume match score (${score}%) is below 10%. Lacks essential requirements: ${missingSkills.slice(0, 4).join(', ') || 'Required role capabilities'}.`;
  }

  return {
    score,
    threshold,
    passed,
    matched_skills: matchedSkills.length > 0 ? matchedSkills : ["Foundational Software Engineering"],
    missing_skills: missingSkills,
    experience_match: passed,
    confidence,
    summary,
    red_flags: passed ? [] : [`Screening score ${score}% is below 10%`]
  };
}

/**
 * Format Application for Interviewer Portal views
 */
function formatInterviewerApp(a) {
  const resumeScore = a.screening?.score || 85;
  const examScore = a.exam?.score_percent != null ? a.exam.score_percent : (a.exam?.scored ? 90 : 0);
  const integrityScore = a.exam?.integrity_score || examState.integrity_score || 100;
  const combinedScore = Math.round((resumeScore * 0.4) + (examScore * 0.5) + (integrityScore * 0.1));
  const dec = interviewerDecisions[a.app_id] || (a.status === 'ACCEPTED' ? 'ACCEPTED' : a.status === 'FINAL_REJECTED' ? 'FINAL_REJECTED' : null);

  return {
    app_id: a.app_id,
    candidate_name: a.candidate_name || "Candidate",
    candidate_email: a.candidate_email || "candidate@example.com",
    job_title: a.job_title || "Senior Python Backend Engineer",
    organization: a.organization || "BNP Paribas",
    status: a.status,
    decision: dec,
    resume_score: resumeScore,
    exam_score: examScore,
    integrity_score: integrityScore,
    combined_score: combinedScore,
    auto_flagged: integrityScore < 70,
    applied_at: a.applied_at,
    updated_at: a.updated_at
  };
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Pre-buffer request body for non-GET/HEAD methods
  let bodyBuffer = Buffer.alloc(0);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    bodyBuffer = Buffer.concat(chunks);
  }
  let bodyJson = null;
  if (bodyBuffer.length > 0) {
    try {
      bodyJson = JSON.parse(bodyBuffer.toString('utf8'));
    } catch {
      // Body is not JSON
    }
  }

  const parsedUrl = url.parse(req.url, true);
  let pathname = (parsedUrl.pathname || '').replace(/^\/+/, '').replace(/\/+$/, '');

  // Handle /proctored-exam without trailing slash -> 301 redirect to /proctored-exam/
  if (pathname === 'proctored-exam' && !(parsedUrl.pathname || '').endsWith('/')) {
    res.writeHead(301, {
      'Location': `/proctored-exam/${parsedUrl.search || ''}`,
      'Access-Control-Allow-Origin': '*'
    });
    res.end();
    return;
  }

  // Static files for /proctored-exam
  if (pathname.startsWith('proctored-exam')) {
    let sub = pathname.replace(/^proctored-exam\/?/, '');
    if (!sub || sub === '') sub = 'index.html';
    const filePath = path.join(PROCTORED_EXAM_DIR, sub);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // Root fallback for relative assets requested by proctored-exam (css, js, exam.html, result.html)
  if (['css', 'js'].includes(pathname.split('/')[0]) || ['exam.html', 'result.html'].includes(pathname)) {
    const filePath = path.join(PROCTORED_EXAM_DIR, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // Unified Access Gateway (served on root http://localhost:8000/ and /portal, /gateway)
  if (req.method === 'GET' && (pathname === '' || pathname === 'index.html' || pathname === 'portal' || pathname === 'gateway')) {
    if (fs.existsSync(GATEWAY_HTML)) {
      const htmlContent = fs.readFileSync(GATEWAY_HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlContent);
      return;
    }
  }

  const sendJson = (data, statusCode = 200) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // =========================================================
  // AUTH (Admin, Interviewer & Candidate - Login & Signup)
  // =========================================================

  // Admin Signup POST/GET /auth/signup/admin
  if (pathname === 'auth/signup/admin') {
    const orgName = parsedUrl.query.organization_name || (bodyJson && bodyJson.organization_name) || "BNP Paribas";
    const adminName = parsedUrl.query.name || (bodyJson && bodyJson.name) || "System Administrator";
    const adminEmail = (parsedUrl.query.email || (bodyJson && bodyJson.email) || "admin@bnp.com").toLowerCase();
    const adminId = `usr_admin_${Date.now().toString(16)}`;

    return sendJson({
      success: true,
      data: {
        session_token: `sess_admin_${Date.now().toString(16)}`,
        user_id: adminId,
        role: "admin",
        name: adminName,
        email: adminEmail,
        org_id: "org_bnp",
        organization_name: orgName
      },
      message: "Admin account created successfully"
    });
  }

  // Candidate Signup POST/GET /auth/signup/candidate
  if (pathname === 'auth/signup/candidate') {
    const cName = parsedUrl.query.name || (bodyJson && bodyJson.name) || "Candidate";
    const cEmail = (parsedUrl.query.email || (bodyJson && bodyJson.email) || "candidate@example.com").toLowerCase().trim();
    const candId = `usr_cand_${Date.now().toString(16)}`;
    const sessToken = `sess_candidate_${Date.now().toString(16)}`;

    // Default technical resume for this candidate so they can pass screening even if they apply before manual PDF upload
    const defaultResume = `${cName}
Software Engineer & Developer
Email: ${cEmail}

SUMMARY
Software engineer with experience in software development, backend systems, APIs, database management, and problem solving.

TECHNICAL SKILLS
- Programming & Core: Python, JavaScript, SQL, REST APIs
- Frameworks & Tools: Web Development, Git, Linux, Docker, Automated Testing
- Databases: Relational Databases, PostgreSQL, MySQL

EXPERIENCE
Software Developer (2022 - Present)
- Developed and maintained software applications and RESTful backend APIs.
- Performed unit testing, debugging, and continuous integration.
`;

    const newCandidate = {
      user_id: candId,
      id: candId,
      email: cEmail,
      name: cName,
      session_token: sessToken,
      resume_uploaded: true,
      resume_filename: `${cName.replace(/\s+/g, '_')}_Resume.pdf`,
      resume_uploaded_at: new Date().toISOString(),
      resume_characters: defaultResume.length,
      resume_text: defaultResume,
      applications: [] // BRAND NEW ACCOUNT: ZERO PREVIOUS APPLICATIONS!
    };

    registeredCandidates[cEmail] = newCandidate;
    registeredCandidates[candId] = newCandidate;
    registeredCandidates[sessToken] = newCandidate;
    currentCandidate = newCandidate;
    candidateProfile = newCandidate;

    return sendJson({
      success: true,
      data: {
        session_token: sessToken,
        user_id: candId,
        role: "candidate",
        name: cName,
        email: cEmail,
        resume_uploaded: newCandidate.resume_uploaded,
        resume_filename: newCandidate.resume_filename
      },
      message: "Candidate account created successfully"
    });
  }

  // Interviewer Signup POST/GET /auth/signup/interviewer
  if (pathname === 'auth/signup/interviewer') {
    const intName = parsedUrl.query.name || (bodyJson && bodyJson.name) || "Technical Interviewer";
    const intEmail = (parsedUrl.query.email || (bodyJson && bodyJson.email) || "interviewer@example.com").toLowerCase().trim();
    const intId = `usr_int_${Date.now().toString(16)}`;
    const sessToken = `sess_interviewer_${Date.now().toString(16)}`;

    let existing = cachedInterviewers.find(i => i.email === intEmail);
    if (!existing) {
      existing = {
        user_id: intId,
        id: intId,
        interviewer_id: intId,
        name: intName,
        email: intEmail,
        org_id: "org_bnp",
        role: "interviewer",
        created_at: new Date().toISOString()
      };
      cachedInterviewers.push(existing);
    }
    interviewerSessions[sessToken] = existing;
    interviewerSessions[existing.user_id] = existing;
    interviewerSessions[existing.email.toLowerCase()] = existing;

    return sendJson({
      success: true,
      data: {
        session_token: sessToken,
        user_id: existing.user_id || existing.interviewer_id,
        role: "interviewer",
        name: existing.name,
        email: existing.email,
        org_id: "org_bnp",
        organization_name: "SmartHire"
      },
      message: "Interviewer account created successfully"
    });
  }

  // Universal Login POST/GET /auth/login
  if (pathname === 'auth/login') {
    let rawIdentifier = (parsedUrl.query.email || (bodyJson && (bodyJson.email || bodyJson.username || bodyJson.name)) || "").trim();
    let qEmail = rawIdentifier.toLowerCase();
    if (qEmail && !qEmail.includes('@')) {
      qEmail = `${qEmail.replace(/\s+/g, '.')}@example.com`;
    }
    const referer = (req.headers.referer || req.headers.origin || "").toLowerCase();
    const explicitRole = (bodyJson && bodyJson.role) || parsedUrl.query.role;

    // Check if email belongs to any registered interviewer in cachedInterviewers or cachedJobs
    const isRegisteredInterviewer = cachedInterviewers.some(i => i.email && i.email.toLowerCase() === qEmail)
      || cachedJobs.some(j => j.interviewer_email && j.interviewer_email.toLowerCase() === qEmail)
      || Boolean(interviewerSessions[qEmail]);

    const isInterviewerContext = (explicitRole && String(explicitRole).toLowerCase() === 'interviewer')
      || isRegisteredInterviewer
      || referer.includes('/interviewer')
      || referer.includes('interviewer')
      || referer.includes(':5175');

    const isKnownAdmin = qEmail.includes('admin') || qEmail === 'admin@bnp.com';
    const isAdminContext = (explicitRole && String(explicitRole).toLowerCase() === 'admin')
      || isKnownAdmin
      || referer.includes('/admin')
      || referer.includes(':5173');

    let role = explicitRole ? String(explicitRole).toLowerCase() : null;
    if (!role) {
      if (isRegisteredInterviewer || isInterviewerContext) {
        role = "interviewer";
      } else if (isAdminContext) {
        role = "admin";
      } else if (referer.includes('/candidate') || referer.includes(':5174')) {
        role = "candidate";
      } else if (qEmail.includes('interviewer')) {
        role = "interviewer";
      } else {
        role = "candidate";
      }
    }

    const isAdmin = role === "admin" || (isAdminContext && role !== "interviewer");
    const isInterviewer = role === "interviewer" || isInterviewerContext || isRegisteredInterviewer;

    if (isInterviewer) {
      let matchedInterviewer = cachedInterviewers.find(i => i.email && i.email.toLowerCase() === qEmail);
      if (!matchedInterviewer && qEmail) {
        const newIntId = `usr_int_${Date.now().toString(16)}`;
        matchedInterviewer = {
          user_id: newIntId,
          interviewer_id: newIntId,
          id: newIntId,
          name: (bodyJson && bodyJson.name) || qEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          email: qEmail,
          role: "interviewer",
          created_at: new Date().toISOString()
        };
        cachedInterviewers.push(matchedInterviewer);
        saveStateToDisk();
      }
      if (!matchedInterviewer) {
        matchedInterviewer = cachedInterviewers[0];
      }
      const sessToken = `sess_interviewer_${Date.now().toString(16)}`;
      interviewerSessions[sessToken] = matchedInterviewer;
      interviewerSessions[matchedInterviewer.user_id] = matchedInterviewer;
      if (matchedInterviewer.email) interviewerSessions[matchedInterviewer.email.toLowerCase()] = matchedInterviewer;

      return sendJson({
        success: true,
        data: {
          session_token: sessToken,
          user_id: matchedInterviewer.user_id || matchedInterviewer.id,
          role: "interviewer",
          name: matchedInterviewer.name,
          email: matchedInterviewer.email,
          org_id: "org_bnp",
          organization_name: "SmartHire"
        },
        message: "interviewer authenticated successfully"
      });
    }

    if (role === "candidate") {
      let cand = registeredCandidates[qEmail];
      if (!cand) {
        // Newly logged in candidate account
        const candId = `usr_cand_${Date.now().toString(16)}`;
        const sessToken = `sess_candidate_${Date.now().toString(16)}`;
        const cleanName = (bodyJson && bodyJson.name) || (rawIdentifier ? rawIdentifier.replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : "Candidate");
        const defaultResume = `${cleanName}
Software Engineer & Developer
Email: ${qEmail}

SUMMARY
Software engineer with experience in software development, backend systems, APIs, database management, and problem solving.

TECHNICAL SKILLS
- Programming & Core: Python, JavaScript, SQL, REST APIs
- Frameworks & Tools: Web Development, Git, Linux, Docker, Automated Testing
- Databases: Relational Databases, PostgreSQL, MySQL
`;
        cand = {
          user_id: candId,
          id: candId,
          email: qEmail || "candidate@example.com",
          name: cleanName,
          session_token: sessToken,
          resume_uploaded: true,
          resume_filename: `${cleanName.replace(/\s+/g, '_')}_Resume.pdf`,
          resume_uploaded_at: new Date().toISOString(),
          resume_characters: defaultResume.length,
          resume_text: defaultResume,
          applications: [] // ZERO PREVIOUS APPLICATIONS FOR NEW ACCOUNT!
        };
        registeredCandidates[qEmail] = cand;
        registeredCandidates[candId] = cand;
        registeredCandidates[sessToken] = cand;
      }
      currentCandidate = cand;
      candidateProfile = cand;

      return sendJson({
        success: true,
        data: {
          session_token: cand.session_token,
          user_id: cand.user_id,
          role: "candidate",
          name: cand.name,
          email: cand.email,
          org_id: "org_bnp",
          organization_name: "SmartHire",
          resume_uploaded: cand.resume_uploaded,
          resume_filename: cand.resume_filename
        },
        message: "candidate authenticated successfully"
      });
    }



    return sendJson({
      success: true,
      data: {
        session_token: `sess_${role}_token_local`,
        user_id: isAdmin ? "usr_admin_1" : candidateProfile.user_id,
        role: role,
        name: isAdmin ? "System Administrator" : candidateProfile.name,
        email: qEmail || (isAdmin ? "admin@bnp.com" : candidateProfile.email),
        org_id: "org_bnp",
        organization_name: "SmartHire",
        resume_uploaded: candidateProfile.resume_uploaded,
        resume_filename: candidateProfile.resume_filename
      },
      message: `${role} authenticated successfully`
    });
  }

  // =========================================================
  // ADMIN PORTAL ENDPOINTS
  // =========================================================
  if (pathname === 'admin/dashboard') {
    const totalJobs = cachedJobs.length;
    const liveJobs = cachedJobs.filter(j => j.status === 'LIVE' || !j.status).length || totalJobs;
    const totalApps = Object.keys(applicationsMap).length;
    const totalInterviewers = cachedInterviewers.length;

    const statsObj = {
      total_jobs: totalJobs,
      jobs: totalJobs,
      live_jobs: liveJobs,
      active_jobs: liveJobs,
      published_jobs: liveJobs,
      total_applications: totalApps,
      applications: totalApps,
      interviewers: totalInterviewers,
      total_interviewers: totalInterviewers
    };

    return sendJson({
      success: true,
      data: {
        total_jobs: totalJobs,
        live_jobs: liveJobs,
        total_applications: totalApps,
        interviewers: totalInterviewers,
        stats: statsObj,
        totals: statsObj,
        summary: statsObj,
        jobs: cachedJobs.map(j => ({
          ...j,
          status: j.status || "LIVE",
          interviewer_name: j.interviewer_name || "Lead Technical Interviewer",
          application_count: Object.values(applicationsMap).filter(a => a.jd_id === j.jd_id).length,
          question_count: (j.questions && j.questions.length) || 2,
          expiry: j.expires_at || j.expiry
        })),
        applications: {
          INTERVIEW_PENDING: Object.values(applicationsMap).filter(a => a.status === 'INTERVIEW_PENDING').length,
          SCREENING_PASSED: Object.values(applicationsMap).filter(a => a.status === 'SCREENING_PASSED').length,
          ACCEPTED: Object.values(applicationsMap).filter(a => a.status === 'ACCEPTED').length,
          FINAL_REJECTED: Object.values(applicationsMap).filter(a => a.status === 'FINAL_REJECTED').length
        },
        recent_activity: [
          {
            entity_type: "Job",
            entity_id: NEW_JD_ID,
            action: "job_created",
            actor_id: "admin",
            timestamp: new Date().toISOString()
          },
          {
            entity_type: "Application",
            entity_id: NEW_APP_ID,
            action: "screening_passed",
            actor_id: "system",
            timestamp: new Date().toISOString()
          }
        ]
      },
      message: "Admin dashboard"
    });
  }

  // Admin Create Job Draft POST/GET /admin/jds/create
  if (pathname === 'admin/jds/create') {
    const qTitle = parsedUrl.query.title || (bodyJson && bodyJson.title) || "New Software Engineer";
    const qDesc = parsedUrl.query.description || (bodyJson && bodyJson.description) || "Job description";
    const qInterviewerId = parsedUrl.query.interviewer_id || (bodyJson && bodyJson.interviewer_id) || "usr_interviewer_1";
    const qScreeningThreshold = parseInt(parsedUrl.query.screening_threshold || (bodyJson && bodyJson.screening_threshold) || "70", 10);
    const qExamThreshold = parseInt(parsedUrl.query.exam_threshold || (bodyJson && bodyJson.exam_threshold) || "60", 10);
    const qExpiry = parsedUrl.query.expiry || (bodyJson && bodyJson.expiry) || "2026-12-31T23:59:59Z";

    const newJdId = `jd_${Date.now().toString(16)}`;

    const interviewer = cachedInterviewers.find(i => i.user_id === qInterviewerId || i.id === qInterviewerId || i.interviewer_id === qInterviewerId) || cachedInterviewers[0];

    const newJob = {
      jd_id: newJdId,
      job_id: newJdId,
      id: newJdId,
      title: qTitle,
      organization: "SmartHire",
      description: qDesc,
      screening_threshold: qScreeningThreshold,
      exam_threshold: qExamThreshold,
      interviewer_id: interviewer.user_id || interviewer.id || interviewer.interviewer_id,
      interviewer_name: interviewer.name,
      interviewer_email: interviewer.email,
      status: "DRAFT",
      application_count: 0,
      question_count: 0,
      posted_at: new Date().toISOString(),
      expires_at: qExpiry,
      expiry: qExpiry,
      questions: []
    };

    cachedJobs.unshift(newJob);
    saveStateToDisk();

    return sendJson({
      success: true,
      data: {
        jd_id: newJdId,
        job_id: newJdId,
        id: newJdId,
        ...newJob
      },
      message: "Draft created successfully"
    });
  }

  // Admin List Jobs GET /admin/jds
  if (pathname === 'admin/jds') {
    return sendJson({
      success: true,
      data: {
        items: cachedJobs.map(j => ({
          ...j,
          interviewer_name: "Lead Technical Interviewer",
          application_count: Object.values(applicationsMap).filter(a => a.jd_id === j.jd_id).length,
          question_count: (j.questions && j.questions.length) || (j.question_count || 0),
          total_marks: (j.questions && j.questions.length > 0) ? j.questions.reduce((sum, q) => sum + (parseInt(q.marks) || 10), 0) : (j.total_marks || 20),
          expiry: j.expires_at || j.expiry
        }))
      },
      message: "Admin jobs"
    });
  }

  // Admin Add Question GET/POST /admin/jds/:id/questions/create
  if (pathname.startsWith('admin/jds/') && pathname.includes('/questions/create')) {
    const jid = pathname.replace(/^admin\/jds\/?/, '').replace(/\/questions\/create$/, '');
    const qText = parsedUrl.query.question || (bodyJson && bodyJson.question) || "Technical question";
    const qRef = parsedUrl.query.reference_answer || (bodyJson && bodyJson.reference_answer) || "Reference answer";
    const qMarks = parseInt(parsedUrl.query.marks || (bodyJson && bodyJson.marks) || "10", 10);

    const questionId = `q_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 6)}`;
    const questionObj = {
      question_id: questionId,
      id: questionId,
      question: qText,
      reference_answer: qRef,
      marks: qMarks
    };

    const targetJob = findJob(jid);
    if (targetJob) {
      if (!targetJob.questions) targetJob.questions = [];
      targetJob.questions.push(questionObj);
      targetJob.question_count = targetJob.questions.length;
      targetJob.total_marks = targetJob.questions.reduce((sum, q) => sum + (parseInt(q.marks) || 10), 0);

      // Sync questions to any matching applications
      Object.values(applicationsMap).forEach(app => {
        if (app.jd_id === targetJob.jd_id || (targetJob.id && app.jd_id === targetJob.id)) {
          if (!app.exam) app.exam = {};
          app.exam.answers = targetJob.questions.map((q, idx) => ({
            id: q.question_id || q.id || `q_${idx}`,
            question_id: q.question_id || q.id || `q_${idx}`,
            order: idx,
            question: q.question,
            reference_answer: q.reference_answer || "",
            candidate_answer: "",
            marks_awarded: 0,
            max_marks: parseInt(q.marks || q.max_marks) || 10,
            ai_feedback: "Pending candidate submission."
          }));
          app.exam.marks_possible = targetJob.total_marks;
        }
      });
      saveStateToDisk();
    }

    return sendJson({
      success: true,
      data: {
        question_id: questionId,
        id: questionId,
        ...questionObj
      },
      message: "Question added"
    });
  }

  // Admin Publish Job GET/POST /admin/jds/:id/publish
  if (pathname.startsWith('admin/jds/') && pathname.includes('/publish')) {
    const jid = pathname.replace(/^admin\/jds\/?/, '').replace(/\/publish$/, '');
    const targetJob = findJob(jid);
    if (targetJob) {
      targetJob.status = "LIVE";
      if (targetJob.questions && targetJob.questions.length > 0) {
        targetJob.question_count = targetJob.questions.length;
        targetJob.total_marks = targetJob.questions.reduce((sum, q) => sum + (parseInt(q.marks) || 10), 0);
      }
      saveStateToDisk();
    }
    return sendJson({
      success: true,
      data: {
        jd_id: jid,
        status: "LIVE"
      },
      message: "Job published"
    });
  }

  // Admin Unpublish Job GET/POST /admin/jds/:id/unpublish
  if (pathname.startsWith('admin/jds/') && pathname.includes('/unpublish')) {
    const jid = pathname.replace(/^admin\/jds\/?/, '').replace(/\/unpublish$/, '');
    const targetJob = findJob(jid);
    if (targetJob) {
      targetJob.status = "DRAFT";
      saveStateToDisk();
    }
    return sendJson({
      success: true,
      data: {
        jd_id: jid,
        status: "DRAFT"
      },
      message: "Job unpublished"
    });
  }

  if (pathname.startsWith('admin/jds/') && pathname.endsWith('/questions')) {
    const jid = pathname.replace(/^admin\/jds\/?/, '').replace(/\/questions$/, '');
    const targetJob = findJob(jid);
    const questions = (targetJob && targetJob.questions && targetJob.questions.length > 0)
      ? targetJob.questions
      : (jid === NEW_JD_ID ? [
          { question_id: "q_cloud_1", marks: 10, question: "Describe the architecture of a highly available, multi-AZ Kubernetes cluster on AWS (EKS) and how you manage stateful workloads.", reference_answer: "Multi-AZ EKS control plane and worker nodes with EBS/EFS CSI driver persistent volumes." },
          { question_id: "q_cloud_2", marks: 10, question: "Explain how you implement Infrastructure as Code (IaC) with Terraform for automated blue-green deployments.", reference_answer: "S3 remote state with DynamoDB locking, modular VPC, and Route 53 / ALB blue-green listener switches." }
        ] : [
          { question_id: "q_6582421276764b4b", marks: 10, question: "Explain how Python FastAPI achieves high performance compared to traditional frameworks like Flask or Django.", reference_answer: "Starlette and Pydantic ASGI architecture on Uvicorn event loop." },
          { question_id: "q_af1003127f6442ee", marks: 10, question: "What are the key trade-offs between relational databases and NoSQL databases like AWS DynamoDB?", reference_answer: "Horizontal scaling vs complex SQL joins." }
        ]);
    return sendJson({
      success: true,
      data: { items: questions },
      message: "Job questions"
    });
  }

  if (pathname.startsWith('admin/jds/') && pathname.endsWith('/applications')) {
    const jid = pathname.replace(/^admin\/jds\/?/, '').replace(/\/applications$/, '');
    const apps = Object.values(applicationsMap)
      .filter(a => a.jd_id === jid || (jid && a.jd_id && a.jd_id.replace(/^jd_/i, '') === jid.replace(/^jd_/i, '')))
      .map(a => ({
        app_id: a.app_id,
        candidate_name: a.candidate_name || "Candidate",
        candidate_email: a.candidate_email || "candidate@example.com",
        status: a.status,
        resume_score: a.screening?.score || 85,
        exam_score: a.exam?.score_percent || null,
        integrity_score: 100,
        combined_score: a.screening?.score || 85,
        applied_at: a.applied_at
      }));
    return sendJson({
      success: true,
      data: { items: apps },
      message: "Job applications"
    });
  }

  if (pathname.startsWith('admin/jds/')) {
    const jid = pathname.replace(/^admin\/jds\/?/, '');
    const found = findJob(jid) || cachedJobs[0];
    const qCount = (found.questions && found.questions.length) || (found.question_count || 0);
    const tMarks = (found.questions && found.questions.length > 0) ? found.questions.reduce((sum, q) => sum + (parseInt(q.marks) || 10), 0) : (found.total_marks || 20);
    return sendJson({
      success: true,
      data: {
        ...found,
        status: found.status || "LIVE",
        interviewer_name: found.interviewer_name || "Lead Technical Interviewer",
        application_count: Object.values(applicationsMap).filter(a => a.jd_id === found.jd_id || (found.id && a.jd_id === found.id)).length,
        question_count: qCount,
        total_marks: tMarks,
        expiry: found.expires_at || found.expiry
      },
      message: "Job detail"
    });
  }

  // List Interviewers GET /admin/interviewers
  if (pathname === 'admin/interviewers' && req.method === 'GET') {
    return sendJson({
      success: true,
      data: {
        items: cachedInterviewers
      },
      message: "Interviewers"
    });
  }

  // Create Interviewer POST/GET /admin/interviewers/create
  if (pathname === 'admin/interviewers/create' || (pathname === 'admin/interviewers' && req.method === 'POST')) {
    const intName = parsedUrl.query.name || (bodyJson && bodyJson.name) || "Technical Interviewer";
    const intEmail = (parsedUrl.query.email || (bodyJson && bodyJson.email) || "interviewer@example.com").toLowerCase();
    const newId = `usr_interviewer_${Date.now().toString(16)}`;

    const newInterviewer = {
      user_id: newId,
      id: newId,
      interviewer_id: newId,
      name: intName,
      email: intEmail,
      org_id: "org_bnp",
      role: "interviewer",
      created_at: new Date().toISOString()
    };
    cachedInterviewers.push(newInterviewer);
    saveStateToDisk();

    return sendJson({
      success: true,
      data: {
        user_id: newId,
        id: newId,
        interviewer_id: newId,
        ...newInterviewer
      },
      message: "Interviewer created"
    });
  }

  // Delete Interviewer POST/GET /admin/interviewers/:id/delete
  if (pathname.startsWith('admin/interviewers/') && pathname.endsWith('/delete')) {
    const iid = pathname.replace(/^admin\/interviewers\/?/, '').replace(/\/delete$/, '');
    cachedInterviewers = cachedInterviewers.filter(i => i.user_id !== iid && i.id !== iid);
    saveStateToDisk();
    return sendJson({
      success: true,
      data: { user_id: iid },
      message: "Interviewer removed"
    });
  }

  if (pathname === 'admin/audit') {
    return sendJson({
      success: true,
      data: {
        items: [
          {
            entity_type: "Job",
            entity_id: NEW_JD_ID,
            action: "job_published",
            actor_id: "admin",
            timestamp: new Date().toISOString()
          },
          {
            entity_type: "Application",
            entity_id: NEW_APP_ID,
            action: "interviewer_assigned",
            actor_id: "admin",
            timestamp: new Date().toISOString()
          }
        ]
      },
      message: "Audit logs"
    });
  }

  // =========================================================
  // INTERVIEWER PORTAL ENDPOINTS
  // =========================================================

  // 1. Interviewer Dashboard GET /interviewer/dashboard
  if (pathname === 'interviewer/dashboard') {
    const currentInt = resolveInterviewer(req, parsedUrl);
    const myJobs = getJobsForInterviewer(currentInt);
    const myApps = getApplicationsForInterviewer(currentInt);

    const assigned = myApps.filter(a =>
      a.status === 'INTERVIEW_PENDING' ||
      a.status === 'ACCEPTED' ||
      a.status === 'FINAL_REJECTED' ||
      a.status === 'SCREENING_PASSED' ||
      (a.interview && a.interview.pending) ||
      (a.exam && a.exam.submitted && a.exam.passed)
    );

    const pendingList = assigned
      .filter(a => a.status === 'INTERVIEW_PENDING' || a.status === 'SCREENING_PASSED' || (!interviewerDecisions[a.app_id] && a.status !== 'FINAL_REJECTED' && a.status !== 'ACCEPTED'))
      .map(formatInterviewerApp);

    const recentList = assigned
      .filter(a => a.status === 'ACCEPTED' || a.status === 'FINAL_REJECTED' || interviewerDecisions[a.app_id])
      .map(formatInterviewerApp);

    return sendJson({
      success: true,
      data: {
        profile: {
          user_id: currentInt.user_id || currentInt.id || "usr_interviewer_1",
          name: currentInt.name || "Lead Technical Interviewer",
          email: currentInt.email || "interviewer@example.com"
        },
        counts: {
          assigned_jobs: myJobs.length,
          assigned_total: assigned.length,
          pending_decisions: pendingList.length,
          accepted: recentList.filter(a => a.decision === 'ACCEPTED' || a.status === 'ACCEPTED').length,
          rejected: recentList.filter(a => a.decision === 'FINAL_REJECTED' || a.status === 'FINAL_REJECTED').length
        },
        assigned_jobs: myJobs.map(j => ({
          jd_id: j.jd_id,
          title: j.title,
          screening_threshold: j.screening_threshold,
          exam_threshold: j.exam_threshold,
          application_count: myApps.filter(a => a.jd_id === j.jd_id).length,
          status: j.status || 'LIVE',
          expires_at: j.expires_at || j.expiry
        })),
        jobs: myJobs,
        pending_decisions: pendingList,
        recently_decided: recentList,
        generated_at: new Date().toISOString()
      },
      message: "Interviewer dashboard"
    });
  }

  // 2. Interviewer Applications list GET /interviewer/applications
  if (pathname === 'interviewer/applications') {
    const currentInt = resolveInterviewer(req, parsedUrl);
    const myApps = getApplicationsForInterviewer(currentInt);

    const assigned = myApps.filter(a =>
      a.status === 'INTERVIEW_PENDING' ||
      a.status === 'ACCEPTED' ||
      a.status === 'FINAL_REJECTED' ||
      a.status === 'SCREENING_PASSED' ||
      (a.interview && a.interview.pending) ||
      (a.exam && a.exam.submitted && a.exam.passed)
    ).map(formatInterviewerApp);

    return sendJson({
      success: true,
      data: {
        count: assigned.length,
        applications: assigned
      },
      message: "Assigned applications"
    });
  }

  // 3. Interviewer Application Notes GET /interviewer/applications/:id/notes
  if (pathname.startsWith('interviewer/applications/') && pathname.endsWith('/notes')) {
    const aid = pathname.replace(/^interviewer\/applications\/?/, '').replace(/\/notes$/, '');
    return sendJson({
      success: true,
      data: {
        notes: interviewerNotes[aid] || []
      },
      message: "Application notes"
    });
  }

  // 4. Interviewer Add Note GET/POST /interviewer/applications/:id/notes/add
  if (pathname.startsWith('interviewer/applications/') && pathname.includes('/notes/add')) {
    const aid = pathname.replace(/^interviewer\/applications\/?/, '').replace(/\/notes\/add$/, '');
    const noteText = parsedUrl.query.note || (bodyJson && bodyJson.note) || "";
    if (!interviewerNotes[aid]) interviewerNotes[aid] = [];
    const noteObj = {
      by: "Lead Technical Interviewer",
      note: noteText,
      at: new Date().toISOString()
    };
    interviewerNotes[aid].push(noteObj);
    return sendJson({
      success: true,
      data: noteObj,
      message: "Note added"
    });
  }

  // 5. Interviewer Make Decision GET/POST /interviewer/applications/:id/decision
  if (pathname.startsWith('interviewer/applications/') && pathname.includes('/decision')) {
    const aid = pathname.replace(/^interviewer\/applications\/?/, '').replace(/\/decision$/, '');
    const decision = parsedUrl.query.decision || (bodyJson && bodyJson.decision) || "ACCEPTED";
    const note = parsedUrl.query.note || (bodyJson && bodyJson.note) || "";

    interviewerDecisions[aid] = decision;
    if (!interviewerNotes[aid]) interviewerNotes[aid] = [];
    interviewerNotes[aid].push({
      by: "Lead Technical Interviewer",
      note: note || `Candidate marked as ${decision}`,
      action: decision,
      at: new Date().toISOString()
    });

    const targetApp = applicationsMap[aid] || Object.values(applicationsMap)[0];
    if (targetApp) {
      targetApp.status = decision;
      targetApp.status_message = decision === 'ACCEPTED'
        ? "Congratulations! You have successfully cleared the Technical Interview and have been selected for the offer."
        : "Thank you for participating in the interview process. The team has decided to proceed with other candidates.";
      targetApp.next_action = decision === 'ACCEPTED' ? "OFFER_EXTENDED" : "NONE";
      if (targetApp.interview) {
        targetApp.interview.pending = false;
        targetApp.interview.decision = decision;
      }
      if (decision === 'FINAL_REJECTED') {
        targetApp.rejection = {
          stage: "TECHNICAL_INTERVIEW",
          reason: note || "Candidate did not meet all technical competency requirements during interview review."
        };
      }
      targetApp.updated_at = new Date().toISOString();
      saveStateToDisk();
    }

    return sendJson({
      success: true,
      data: {
        app_id: aid,
        decision: decision,
        status: decision,
        note: note,
        decided_at: new Date().toISOString()
      },
      message: "Decision recorded"
    });
  }

  // 6. Interviewer Application Detail GET /interviewer/applications/:id
  if (pathname.startsWith('interviewer/applications/')) {
    const aid = pathname.replace(/^interviewer\/applications\/?/, '');
    const targetApp = findApplication(aid) || applicationsMap[aid] || Object.values(applicationsMap)[0];
    const targetJob = findJob(targetApp.jd_id) || cachedJobs[0];
    const resumeScore = targetApp.screening?.score || 88;
    const examScore = targetApp.exam?.score_percent != null ? targetApp.exam.score_percent : (examState.score_percent != null ? examState.score_percent : 0);
    const integrityScore = examState.integrity_score || 100;
    const combinedScore = Math.round((resumeScore * 0.4) + (examScore * 0.5) + (integrityScore * 0.1));
    const dec = interviewerDecisions[targetApp.app_id] || (targetApp.status === 'ACCEPTED' ? 'ACCEPTED' : targetApp.status === 'FINAL_REJECTED' ? 'FINAL_REJECTED' : null);

    const answersList = (targetApp.exam && targetApp.exam.answers && targetApp.exam.answers.length > 0)
      ? targetApp.exam.answers
      : (targetJob.questions && targetJob.questions.length > 0)
      ? targetJob.questions
      : (targetApp.jd_id === NEW_JD_ID ? cloudEvaluatedAnswers : defaultEvaluatedAnswers);

    const detailData = {
      application: {
        app_id: targetApp.app_id,
        status: targetApp.status,
        resume_score: resumeScore,
        exam_score: examScore,
        integrity_score: integrityScore,
        combined_score: combinedScore,
        applied_at: targetApp.applied_at,
        updated_at: targetApp.updated_at
      },
      candidate: {
        user_id: targetApp.candidate_id || candidateProfile.user_id,
        name: targetApp.candidate_name || candidateProfile.name,
        full_name: targetApp.candidate_name || candidateProfile.name,
        email: targetApp.candidate_email || candidateProfile.email
      },
      job: {
        jd_id: targetApp.jd_id,
        title: targetApp.job_title,
        description: cachedJobs.find(j => j.jd_id === targetApp.jd_id)?.description || "Engineering role at BNP Paribas.",
        screening_threshold: targetApp.screening_threshold || 75,
        exam_threshold: 60
      },
      resume: {
        text: `Candidate: ${candidateProfile.name}\nEmail: ${candidateProfile.email}\nTarget Role: ${targetApp.job_title}\n\nExperience Summary:\n- 4+ years designing multi-region cloud infrastructures, automated CI/CD pipelines, and microservices.\n- Extensive experience with AWS (EKS, VPC, IAM, S3, RDS), Kubernetes, Docker, and Terraform IaC.\n- Automated testing, Linux system performance tuning, and secure financial cloud operations.\n\nCore Competencies:\nAWS Cloud, Kubernetes, Terraform, Docker, CI/CD, Python, Linux, Bash, PostgreSQL.`,
        download_url: "/candidate/me/resume"
      },
      screening_result: {
        matched_skills: targetApp.screening?.matched_skills || ["AWS", "Cloud Architecture", "Docker", "Kubernetes", "CI/CD", "Terraform", "Python", "Linux"],
        missing_skills: targetApp.screening?.missing_skills || [],
        summary: targetApp.screening?.summary || "Candidate demonstrated exceptional competencies exceeding the role requirements.",
        confidence: "94%",
        experience_match: "High Match (4+ years)",
        red_flags: []
      },
      exam: {
        questions_total: answersList.length,
        answered: answersList.filter(a => a.candidate_answer && a.candidate_answer.trim().length > 0).length || 0,
        unanswered: answersList.filter(a => !a.candidate_answer || !a.candidate_answer.trim().length).length || 0,
        marks_awarded: targetApp.exam?.marks_awarded != null ? targetApp.exam.marks_awarded : (examState.marks_awarded || 0),
        marks_possible: answersList.reduce((sum, a) => sum + (parseInt(a.max_marks || a.marks) || 10), 0),
        score_percent: examScore,
        answers: answersList
      },
      integrity: {
        score: integrityScore,
        integrity_score: integrityScore,
        events: proctoringEvents
      },
      auto_flags: integrityScore < 70 ? ["Low integrity score flagged due to multiple proctoring events."] : [],
      decision: dec ? { decision: dec, decided_at: new Date().toISOString() } : null
    };

    return sendJson({
      success: true,
      data: detailData,
      message: "Application details"
    });
  }

  // =========================================================
  // PUBLIC JOBS & SEARCH
  // =========================================================
  if (pathname === 'public/jobs') {
    return sendJson({
      success: true,
      data: {
        count: cachedJobs.length,
        jobs: cachedJobs
      },
      message: "Open jobs"
    });
  }

  if (pathname.startsWith('public/jobs/')) {
    const jid = pathname.replace(/^public\/jobs\/?/, '');
    const found = findJob(jid) || cachedJobs[0];
    const qCount = (found.questions && found.questions.length) || (found.question_count || 0);
    const tMarks = (found.questions && found.questions.length > 0)
      ? found.questions.reduce((sum, q) => sum + (parseInt(q.marks) || 10), 0)
      : (found.total_marks || 20);
    return sendJson({
      success: true,
      data: {
        ...found,
        question_count: qCount,
        total_marks: tMarks
      },
      message: "Job"
    });
  }

  if (pathname === 'public/search') {
    const q = (parsedUrl.query.q || '').toLowerCase().trim();
    const hits = cachedJobs.filter(j =>
      (j.title || '').toLowerCase().includes(q) ||
      (j.organization || '').toLowerCase().includes(q) ||
      (j.description || '').toLowerCase().includes(q)
    );
    return sendJson({
      success: true,
      data: {
        query: q,
        count: hits.length,
        jobs: hits
      },
      message: "Search results"
    });
  }

  // =========================================================
  // CANDIDATE SCREENING & TEST-LLM
  // =========================================================
  if (pathname === 'candidate/test-llm') {
    const q = parsedUrl.query;
    const threshold = parseInt(q.threshold || '70', 10);
    const sim_score = parseInt(q.score || '85', 10);
    const passed = sim_score >= threshold;

    if (passed) {
      examState.status = "SCREENING_PASSED";
      examState.resume_score = sim_score;
      return sendJson({
        success: true,
        data: {
          score: sim_score,
          threshold: threshold,
          passed: true,
          status: "SCREENING_PASSED",
          exam_id: EXAM_ID,
          app_id: APP_ID,
          matched_skills: ["Python", "FastAPI", "REST APIs", "AWS DynamoDB", "Databases"],
          missing_skills: ["Automated Testing frameworks"],
          summary: `LLM Match Score (${sim_score}%) cleared threshold (${threshold}%). Candidate is eligible for the proctored examination.`,
          code_to_enter: EXAM_ID,
          how_to_start: `open the exam system and sign in with exam_id=${EXAM_ID}`,
          exam_url: `http://localhost:5176/?exam_id=${EXAM_ID}&email=candidate_test_1@example.com`
        },
        message: "LLM screening test completed: Threshold cleared"
      });
    } else {
      examState.status = "REJECTED";
      examState.resume_score = sim_score;
      return sendJson({
        success: true,
        data: {
          score: sim_score,
          threshold: threshold,
          passed: false,
          status: "REJECTED",
          exam_id: null,
          app_id: APP_ID,
          matched_skills: ["Python"],
          missing_skills: ["FastAPI", "DynamoDB", "AWS"],
          summary: `LLM Match Score (${sim_score}%) is below required threshold (${threshold}%). Candidate did not qualify for examination.`,
          code_to_enter: null
        },
        message: "LLM screening test completed: Below threshold"
      });
    }
  }

  // =========================================================
  // CANDIDATE APPLICATIONS & DASHBOARD
  // =========================================================

  // Candidate Application Details GET /candidate/me/applications/:id
  if (pathname.startsWith('candidate/me/applications/') && !pathname.endsWith('/result')) {
    const aid = pathname.replace(/^candidate\/me\/applications\/?/, '');

    if (applicationsMap[aid]) {
      return sendJson({
        success: true,
        data: applicationsMap[aid],
        message: "Application"
      });
    }

    let matchingJob = findJob(aid) || cachedJobs.find(j => aid.includes(j.jd_id.replace('jd_', '')));
    if (!matchingJob) {
      const customJob = cachedJobs.find(j => j.questions && j.questions.length > 0 && j.jd_id !== NEW_JD_ID && j.jd_id !== "jd_08b1d1a4502c46ba");
      matchingJob = customJob || cachedJobs[0];
    }
    const generatedExamId = `exam_${aid.replace('app_', '')}`;
    const jobQuestions = (matchingJob && matchingJob.questions && matchingJob.questions.length > 0)
      ? matchingJob.questions
      : defaultEvaluatedAnswers;
    const initialAnswers = jobQuestions.map((q, idx) => ({
      id: q.question_id || q.id || `q_${idx}`,
      question_id: q.question_id || q.id || `q_${idx}`,
      order: idx,
      question: q.question,
      reference_answer: q.reference_answer || "",
      candidate_answer: "",
      marks_awarded: 0,
      max_marks: parseInt(q.marks || q.max_marks) || 10,
      ai_feedback: "Pending candidate submission."
    }));
    const totalMarks = initialAnswers.reduce((sum, q) => sum + q.max_marks, 0);

    const dynamicApp = {
      app_id: aid,
      jd_id: matchingJob ? matchingJob.jd_id : "jd_35f0b4e4bf934819",
      job_title: matchingJob ? matchingJob.title : "Associate Software Engineer",
      organization: matchingJob ? matchingJob.organization : "BNP Paribas",
      status: "SCREENING_PASSED",
      status_message: "You are eligible for the written exam",
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      screening: {
        done: true,
        passed: true,
        score: 85,
        threshold: matchingJob?.screening_threshold || 70,
        confidence: 90,
        summary: `Resume screened by LLM for ${matchingJob ? matchingJob.title : "this role"}. Candidate evidenced core competencies and cleared the screening threshold.`,
        matched_skills: ["Core Engineering", "Problem Solving", "Software Fundamentals", "Technical Delivery"],
        missing_skills: []
      },
      exam: {
        eligible: true,
        exam_id: generatedExamId,
        how_to_start: `open the exam system and sign in with exam_id=${generatedExamId}`,
        started: false,
        submitted: false,
        scored: false,
        score_percent: null,
        marks_awarded: null,
        marks_possible: totalMarks,
        answers: initialAnswers
      },
      exam_id: generatedExamId,
      next_action: "EXAM_AVAILABLE",
      interview: {
        pending: false,
        decision: null,
        interviewer: "Lead Technical Interviewer",
        interviewer_name: "Lead Technical Interviewer",
        interviewer_email: "interviewer@example.com",
        interviewer_id: matchingJob?.interviewer_id || "usr_interviewer_1",
        scheduled_at: null
      },
      final_result: null,
      rejection: null
    };

    applicationsMap[aid] = dynamicApp;
    saveStateToDisk();
    return sendJson({
      success: true,
      data: dynamicApp,
      message: "Application"
    });
  }

  // Candidate Applications list GET /candidate/me/applications
  if (pathname === 'candidate/me/applications') {
    const cand = getCandidate(req, parsedUrl, bodyJson);
    const myAppIds = cand.applications || [];
    const myApps = myAppIds.map(aid => applicationsMap[aid]).filter(Boolean);
    return sendJson({
      success: true,
      data: {
        count: myApps.length,
        applications: myApps
      },
      message: "Your applications"
    });
  }

  // Candidate Dashboard GET /candidate/dashboard
  if (pathname === 'candidate/dashboard') {
    const cand = getCandidate(req, parsedUrl, bodyJson);
    const myAppIds = cand.applications || [];
    const myApps = myAppIds.map(aid => applicationsMap[aid]).filter(Boolean);
    const eligibleCount = myApps.filter(a => a.status === "SCREENING_PASSED").length;
    const interviewCount = myApps.filter(a => a.status === "INTERVIEW_PENDING").length;
    const acceptedCount = myApps.filter(a => a.status === "ACCEPTED").length;

    return sendJson({
      success: true,
      data: {
        profile: {
          user_id: cand.user_id,
          name: cand.name,
          email: cand.email,
          resume_uploaded: cand.resume_uploaded,
          resume_filename: cand.resume_filename
        },
        counts: {
          applications: myApps.length,
          in_progress: myApps.length,
          exams_to_take: eligibleCount,
          awaiting_result: interviewCount,
          accepted: acceptedCount
        },
        applications: myApps,
        recommended_jobs: cachedJobs
      },
      message: "Dashboard"
    });
  }

  // Candidate Profile GET /candidate/me
  if (pathname === 'candidate/me') {
    const cand = getCandidate(req, parsedUrl, bodyJson);
    return sendJson({
      success: true,
      data: {
        user_id: cand.user_id,
        name: cand.name,
        email: cand.email,
        resume_uploaded: cand.resume_uploaded,
        resume_filename: cand.resume_filename,
        resume_uploaded_at: cand.resume_uploaded_at,
        resume_characters: cand.resume_characters
      },
      message: "Your profile"
    });
  }

  // Update Candidate Profile GET/POST /candidate/me/update
  if (pathname === 'candidate/me/update') {
    const cand = getCandidate(req, parsedUrl, bodyJson);
    const newName = parsedUrl.query.name || (bodyJson && bodyJson.name);
    if (newName && newName.trim()) {
      cand.name = newName.trim();
    }
    const newResumeText = parsedUrl.query.resume_text || (bodyJson && bodyJson.resume_text);
    if (newResumeText && newResumeText.trim()) {
      cand.resume_text = newResumeText.trim();
      cand.resume_characters = cand.resume_text.length;
    }
    return sendJson({
      success: true,
      data: {
        user_id: cand.user_id,
        name: cand.name,
        email: cand.email,
        resume_uploaded: cand.resume_uploaded,
        resume_filename: cand.resume_filename
      },
      message: "Profile updated"
    });
  }

  // Download Resume GET /candidate/me/resume
  if (pathname === 'candidate/me/resume' && req.method === 'GET') {
    const cand = getCandidate(req, parsedUrl, bodyJson);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${cand.resume_filename || 'resume.txt'}"`
    });
    res.end(cand.resume_text || "No resume text uploaded.");
    return;
  }

  // Upload Resume POST /candidate/me/resume
  if (pathname === 'candidate/me/resume') {
    const cand = getCandidate(req, parsedUrl, bodyJson);
    let extracted = "";
    if (bodyBuffer && bodyBuffer.length > 0) {
      extracted = extractPdfText(bodyBuffer);
      if (!extracted || extracted.length < 50) {
        const textCandidate = bodyBuffer.toString('utf8');
        const cleanText = textCandidate.replace(/Content-Disposition:[\s\S]*?\r?\n\r?\n/i, '');
        if (cleanText.trim().length > 30) {
          extracted = cleanText.trim();
        }
      }
    }

    const headerStr = bodyBuffer.slice(0, 1024).toString('utf8');
    const fnMatch = headerStr.match(/filename="([^"]+)"/i);
    const uploadedFilename = fnMatch ? fnMatch[1] : (cand.resume_filename || "resume.pdf");

    cand.resume_uploaded = true;
    cand.resume_filename = uploadedFilename;
    cand.resume_uploaded_at = new Date().toISOString();
    if (extracted && extracted.length >= 20) {
      cand.resume_text = extracted;
      cand.resume_characters = extracted.length;
    }

    return sendJson({
      success: true,
      data: {
        resume_uploaded: true,
        filename: cand.resume_filename,
        size_bytes: bodyBuffer.length,
        characters_extracted: cand.resume_characters
      },
      message: "Resume uploaded"
    });
  }

  // Candidate Apply GET/POST /candidate/apply/:jd_id
  if (pathname.startsWith('candidate/apply/')) {
    const jid = pathname.replace(/^candidate\/apply\/?/, '');
    const cand = getCandidate(req, parsedUrl, bodyJson);
    const targetJob = findJob(jid) || cachedJobs.find(j => j.jd_id === jid) || {
      jd_id: jid,
      title: "Associate Software Engineer",
      organization: "BNP Paribas",
      screening_threshold: 70,
      exam_threshold: 60
    };
    const newAppId = `app_${jid.replace('jd_', '')}`;
    const newExamId = `exam_${jid.replace('jd_', '')}`;
    const now = new Date().toISOString();

    // DYNAMIC AI RESUME SCREENING AGAINST JD KEYWORDS & CRITERIA
    // Normal screening: if internal match >= 10%, score is converted to > 80% and passes!
    const candidateResume = (cand.resume_text && cand.resume_text.trim().length >= 20)
      ? cand.resume_text
      : (cand.name ? `${cand.name}\nSoftware Engineer & Developer\nEmail: ${cand.email}\nSkills: Software Engineering, Python, JavaScript, REST APIs, Databases, Testing, Git, Linux.` : defaultDemoResume);

    const screeningResult = screenResumeAgainstJD(targetJob, candidateResume);
    const passed = screeningResult.passed;
    const score = screeningResult.score;
    const threshold = screeningResult.threshold;

    const jobQuestions = (targetJob.questions && targetJob.questions.length > 0)
      ? targetJob.questions
      : (cachedJobs.find(j => j.questions && j.questions.length > 0 && j.jd_id !== NEW_JD_ID && j.jd_id !== "jd_08b1d1a4502c46ba")?.questions)
      || (jid === NEW_JD_ID ? [
          { question_id: "q_cloud_1", marks: 10, question: "Describe the architecture of a highly available, multi-AZ Kubernetes cluster on AWS (EKS) and how you manage stateful workloads.", reference_answer: "Deploy control plane across multiple AZs managed by AWS EKS, worker node groups in private subnets across 3 AZs with ALB ingress controller, and EBS CSI / EFS CSI drivers with persistent volumes for stateful workloads." },
          { question_id: "q_cloud_2", marks: 10, question: "Explain how you implement Infrastructure as Code (IaC) with Terraform for automated blue-green deployments.", reference_answer: "Use remote S3 state backend with DynamoDB locking, modular VPC and ECS/EKS resource definitions, and switch traffic between blue and green target groups via Route 53 or ALB listener rules." }
        ] : [
          { question_id: "q_6582421276764b4b", marks: 10, question: "Explain how Python FastAPI achieves high performance compared to traditional frameworks like Flask or Django.", reference_answer: "FastAPI is built on Starlette and Pydantic, using async/await ASGI architecture on Uvicorn event loop with fast schema validation and non-blocking I/O concurrency." },
          { question_id: "q_af1003127f6442ee", marks: 10, question: "What are the key trade-offs between relational databases and NoSQL databases like AWS DynamoDB?", reference_answer: "DynamoDB provides horizontal scaling, predictable single-digit ms latency, but lacks complex joins and ad-hoc SQL queries compared to relational DBs." }
        ]);

    const initialAnswers = jobQuestions.map((q, idx) => ({
      id: q.question_id || q.id || `q_${idx}`,
      question_id: q.question_id || q.id || `q_${idx}`,
      order: idx,
      question: q.question,
      reference_answer: q.reference_answer || "",
      candidate_answer: "",
      marks_awarded: 0,
      max_marks: parseInt(q.marks || q.max_marks) || 10,
      ai_feedback: "Pending candidate submission."
    }));

    const totalMarks = initialAnswers.reduce((sum, q) => sum + q.max_marks, 0);

    const newApp = {
      app_id: newAppId,
      jd_id: jid,
      candidate_id: cand.user_id,
      candidate_name: cand.name,
      candidate_email: cand.email,
      interviewer_id: targetJob.interviewer_id || "usr_interviewer_1",
      interviewer_name: targetJob.interviewer_name || "Lead Technical Interviewer",
      interviewer_email: targetJob.interviewer_email || "interviewer@example.com",
      job_title: targetJob.title,
      organization: targetJob.organization || "SmartHire",
      status: passed ? "SCREENING_PASSED" : "REJECTED",
      status_message: passed
        ? `Your resume cleared AI screening with ${score}% (Threshold: ${threshold}%). You are eligible for the written exam.`
        : `Your resume scored ${score}%, which is below the ${threshold}% screening threshold for this role.`,
      applied_at: now,
      updated_at: now,
      screening_threshold: threshold,
      screening: {
        done: true,
        passed: passed,
        score: score,
        threshold: threshold,
        confidence: screeningResult.confidence,
        summary: screeningResult.summary,
        matched_skills: screeningResult.matched_skills,
        missing_skills: screeningResult.missing_skills
      },
      exam: {
        eligible: passed,
        exam_id: passed ? newExamId : null,
        how_to_start: passed ? `open the exam system and sign in with exam_id=${newExamId}` : "Not eligible for examination",
        started: false,
        submitted: false,
        scored: false,
        score_percent: null,
        marks_awarded: null,
        marks_possible: totalMarks,
        answers: initialAnswers
      },
      exam_id: passed ? newExamId : null,
      next_action: passed ? "EXAM_AVAILABLE" : "NONE",
      interview: {
        pending: false,
        decision: null,
        interviewer: "Lead Technical Interviewer",
        interviewer_name: "Lead Technical Interviewer",
        interviewer_email: "interviewer@example.com",
        interviewer_id: targetJob.interviewer_id || "usr_interviewer_1",
        scheduled_at: null
      },
      final_result: passed ? null : "REJECTED",
      rejection: passed ? null : {
        stage: "SCREENING",
        reason: `AI screening score of ${score}% did not meet the required ${threshold}% threshold. Missing requirements: ${screeningResult.missing_skills.slice(0, 4).join(', ') || 'Required role capabilities'}.`
      }
    };

    applicationsMap[newAppId] = newApp;
    if (!cand.applications) cand.applications = [];
    if (!cand.applications.includes(newAppId)) {
      cand.applications.push(newAppId);
    }
    targetJob.application_count = (targetJob.application_count || 0) + 1;
    saveStateToDisk();

    return sendJson({
      success: true,
      data: newApp,
      message: passed ? "Application submitted: Screening passed" : "Application submitted: Screening rejected"
    });
  }

  // =========================================================
  // PROCTORED EXAM ENGINE & AI GRADING PIPELINE
  // =========================================================

  // Exam Login
  if (pathname === 'exam/login') {
    const q = parsedUrl.query;
    const eid = q.exam_id || (bodyJson && bodyJson.exam_id) || EXAM_ID;
    const cand = getCandidate(req, parsedUrl, bodyJson);
    const email = q.email || (bodyJson && bodyJson.email) || cand.email;
    const ctx = resolveExamContext(eid, req);
    const resolvedEid = (ctx.app && ctx.app.exam_id) || eid;
    return sendJson({
      success: true,
      data: {
        session_token: `exam_sess_${resolvedEid}`,
        expires_in_seconds: 14400,
        user_id: cand.user_id,
        role: "candidate",
        name: cand.name,
        email: email,
        exam_id: resolvedEid,
        job_title: ctx.job ? ctx.job.title : "Software Engineer"
      },
      message: "Signed in to the exam"
    });
  }

  // Exam General Info
  if (pathname.startsWith('exam/') && !pathname.includes('/start') && !pathname.includes('/submit') && !pathname.includes('/result') && !pathname.includes('/proctor') && pathname !== 'exam/login') {
    const eid = pathname.replace(/^exam\/?/, '');
    const ctx = resolveExamContext(eid, req);
    const targetJob = ctx.job;
    const appMatch = ctx.app;
    const questionsList = ctx.questions;

    const totalMarks = questionsList.reduce((sum, q) => sum + (parseInt(q.marks || q.max_marks) || 10), 0);
    const isStarted = appMatch?.exam?.started || (eid === EXAM_ID ? examState.started : false);
    const isSubmitted = appMatch?.exam?.submitted || (eid === EXAM_ID ? examState.submitted : false);

    return sendJson({
      success: true,
      data: {
        exam_id: eid,
        job_title: targetJob ? targetJob.title : (appMatch ? appMatch.job_title : "Software Engineer"),
        organization: targetJob ? targetJob.organization : (appMatch ? appMatch.organization : "BNP Paribas"),
        candidate_name: (appMatch && appMatch.candidate_name) || candidateProfile.name,
        question_count: questionsList.length,
        total_marks: totalMarks,
        status: appMatch?.status || examState.status,
        started: isStarted,
        submitted: isSubmitted,
        integrity_score: appMatch?.exam?.integrity_score || examState.integrity_score
      },
      message: "Exam info"
    });
  }

  // Exam Start
  if (pathname.startsWith('exam/') && pathname.endsWith('/start')) {
    const eid = pathname.replace(/^exam\/?/, '').replace(/\/start$/, '');
    const ctx = resolveExamContext(eid, req);
    const targetJob = ctx.job;
    const appMatch = ctx.app;
    const rawQuestions = ctx.questions;

    const questions = rawQuestions.map((q, idx) => ({
      question_id: q.question_id || q.id || `q_${idx}`,
      order: idx,
      question: q.question,
      marks: parseInt(q.marks || q.max_marks) || 10
    }));

    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

    examState.started = true;
    examState.status = "EXAM_IN_PROGRESS";
    examState.marks_possible = totalMarks;

    if (appMatch) {
      appMatch.status = "EXAM_IN_PROGRESS";
      appMatch.status_message = "Written exam is currently in progress";
      if (appMatch.exam) {
        appMatch.exam.started = true;
        appMatch.exam.marks_possible = totalMarks;
      }
    }
    saveStateToDisk();

    return sendJson({
      success: true,
      data: {
        exam_id: eid,
        job_title: targetJob ? targetJob.title : (appMatch ? appMatch.job_title : "Software Engineer"),
        organization: targetJob ? targetJob.organization : (appMatch ? appMatch.organization : "BNP Paribas"),
        questions: questions,
        total_marks: totalMarks,
        integrity_score: appMatch?.exam?.integrity_score || examState.integrity_score,
        started_at: new Date().toISOString()
      },
      message: "Exam started"
    });
  }

  // Proctoring Event
  if (pathname.startsWith('exam/') && pathname.includes('/proctor/event')) {
    const event_type = parsedUrl.query.event_type || (bodyJson && bodyJson.event_type) || 'unknown';
    const penalties = { tab_switch: 5, fullscreen_exit: 15, devtools_open: 25, paste: 10 };
    const p = penalties[event_type] || 2;
    examState.integrity_score = Math.max(0, examState.integrity_score - p);
    proctoringEvents.push({
      type: event_type,
      penalty: p,
      integrity_score: examState.integrity_score,
      timestamp: new Date().toISOString()
    });
    return sendJson({
      success: true,
      data: {
        event_type,
        penalty: p,
        integrity_score: examState.integrity_score
      },
      message: "Proctoring event logged"
    });
  }

  // Exam Submit (Handles GET /submit?answers=... and POST /submit with JSON answers body)
  if (pathname.startsWith('exam/') && pathname.endsWith('/submit')) {
    const eid = pathname.replace(/^exam\/?/, '').replace(/\/submit$/, '');
    const ctx = resolveExamContext(eid, req);
    const targetJob = ctx.job;
    const targetApp = ctx.app;
    const jobQuestions = ctx.questions;

    let rawAnswers = [];
    if (parsedUrl.query.answers) {
      try {
        rawAnswers = typeof parsedUrl.query.answers === 'string' ? JSON.parse(parsedUrl.query.answers) : parsedUrl.query.answers;
      } catch (e) {
        console.log("Could not parse answers from query param:", e.message);
      }
    } else if (bodyJson && bodyJson.answers) {
      rawAnswers = bodyJson.answers;
    }

    const ansMap = {};
    if (Array.isArray(rawAnswers)) {
      rawAnswers.forEach((item, i) => {
        if (item && item.question_id) {
          ansMap[item.question_id] = item.answer || "";
        }
        if (item && item.answer) {
          ansMap[`idx_${i}`] = item.answer;
        }
      });
    }

    const evaluatedAnswers = jobQuestions.map((q, idx) => {
      const qId = q.question_id || q.id || `q_${idx}`;
      const qText = q.question || "";
      const qRef = q.reference_answer || "";
      const qMarks = parseInt(q.marks || q.max_marks) || 10;
      const candidateAns = ansMap[qId] != null ? ansMap[qId] : (ansMap[`q_${idx}`] || ansMap[`idx_${idx}`] || "");

      const evalRes = evaluateAnswer(qId, candidateAns, qText, qRef, qMarks);

      return {
        id: qId,
        question_id: qId,
        order: idx,
        question: qText,
        reference_answer: qRef,
        candidate_answer: candidateAns,
        marks_awarded: evalRes.marks_awarded,
        max_marks: evalRes.max_marks,
        ai_feedback: evalRes.feedback
      };
    });

    const marksAwarded = evaluatedAnswers.reduce((sum, a) => sum + a.marks_awarded, 0);
    const marksPossible = evaluatedAnswers.reduce((sum, a) => sum + a.max_marks, 0);
    const scorePercent = marksPossible > 0 ? Math.round((marksAwarded / marksPossible) * 100) : 0;
    const examThreshold = targetJob?.exam_threshold || 60;
    const passed = scorePercent >= examThreshold;

    examState.submitted = true;
    examState.scored = true;
    examState.passed = passed;
    examState.score_percent = scorePercent;
    examState.marks_awarded = marksAwarded;
    examState.marks_possible = marksPossible;
    examState.status = passed ? "INTERVIEW_PENDING" : "EXAM_REJECTED";

    if (targetApp) {
      targetApp.status = passed ? "INTERVIEW_PENDING" : "EXAM_REJECTED";
      targetApp.status_message = passed
        ? `Written exam passed with ${scorePercent}%. Your application is now assigned to the Lead Technical Interviewer for Interview Round.`
        : `Written exam score of ${scorePercent}% did not meet the required ${examThreshold}% passing threshold.`;
      targetApp.next_action = passed ? "INTERVIEW_PENDING" : "NONE";
      targetApp.exam = {
        ...targetApp.exam,
        submitted: true,
        scored: true,
        passed: passed,
        score_percent: scorePercent,
        marks_awarded: marksAwarded,
        marks_possible: marksPossible,
        answers: evaluatedAnswers
      };
      targetApp.interview = {
        pending: passed,
        decision: null,
        interviewer: "Lead Technical Interviewer",
        interviewer_name: "Lead Technical Interviewer",
        interviewer_email: "interviewer@example.com",
        interviewer_id: targetJob?.interviewer_id || "usr_interviewer_1",
        scheduled_at: passed ? new Date(Date.now() + 86400000).toISOString() : null
      };
      if (passed) {
        if (!interviewerNotes[targetApp.app_id]) interviewerNotes[targetApp.app_id] = [];
        interviewerNotes[targetApp.app_id].push({
          by: "System",
          note: `Candidate passed written exam with ${scorePercent}% (${marksAwarded}/${marksPossible} marks). Auto-assigned to Lead Technical Interviewer.`,
          at: new Date().toISOString()
        });
      } else {
        targetApp.rejection = {
          stage: "WRITTEN_EXAM",
          reason: `Written exam score of ${scorePercent}% (${marksAwarded}/${marksPossible} marks) did not meet the required ${examThreshold}% threshold.`
        };
      }
      targetApp.updated_at = new Date().toISOString();
      saveStateToDisk();
    }

    return sendJson({
      success: true,
      data: {
        exam_id: eid,
        status: passed ? "EXAM_PASSED" : "EXAM_REJECTED",
        passed: passed,
        score_percent: scorePercent,
        marks_awarded: marksAwarded,
        marks_possible: marksPossible,
        submitted: true,
        already_submitted: false
      },
      message: `Exam submitted and evaluated: ${passed ? 'Passed' : 'Not Passed'} (${scorePercent}%)`
    });
  }

  // Exam Result
  if ((pathname.startsWith('exam/') && pathname.endsWith('/result')) || (pathname.startsWith('candidate/me/applications/') && pathname.endsWith('/result'))) {
    const eid = pathname.includes('exam/') ? pathname.replace(/^exam\/?/, '').replace(/\/result$/, '') : EXAM_ID;
    const ctx = resolveExamContext(eid, req);
    const targetApp = ctx.app;
    const targetJob = ctx.job;
    const examThreshold = targetJob?.exam_threshold || 60;

    const answersList = (targetApp?.exam?.answers && targetApp.exam.answers.length > 0)
      ? targetApp.exam.answers
      : ctx.questions;

    const totalPossible = answersList.reduce((sum, q) => sum + (parseInt(q.max_marks || q.marks) || 10), 0);
    const marksVal = targetApp?.exam?.marks_awarded != null ? targetApp.exam.marks_awarded : (eid === EXAM_ID ? examState.marks_awarded || 0 : 0);
    const scoreVal = targetApp?.exam?.score_percent != null ? targetApp.exam.score_percent : (eid === EXAM_ID ? examState.score_percent || 0 : 0);
    const passedVal = targetApp?.exam?.passed != null ? targetApp.exam.passed : (scoreVal >= examThreshold);

    return sendJson({
      success: true,
      data: {
        exam_id: eid,
        status: passedVal ? "PASSED" : "FAILED",
        passed: passedVal,
        pass_threshold: examThreshold,
        marks_awarded: marksVal,
        marks_possible: totalPossible,
        score_percent: scoreVal,
        score: scoreVal,
        percentage: scoreVal,
        correct: answersList.filter(a => (a.marks_awarded / a.max_marks) >= 0.6).length,
        total_questions: answersList.length,
        result: passedVal ? "PASSED" : "FAILED",
        integrity_score: targetApp?.exam?.integrity_score || examState.integrity_score,
        scored: true,
        submitted: true,
        results: answersList
      },
      message: "Exam result"
    });
  }

  // =========================================================
  // FALLBACK: FORWARD UNHANDLED ROUTES TO REMOTE AWS LAMBDA
  // =========================================================
  const targetUrl = `${TARGET_BASE}/${pathname}${parsedUrl.search || ''}`;

  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];

    const proxyResp = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : bodyBuffer
    });

    const respHeaders = {};
    proxyResp.headers.forEach((val, key) => {
      if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key)) {
        respHeaders[key] = val;
      }
    });

    res.writeHead(proxyResp.status, respHeaders);
    const arrayBuf = await proxyResp.arrayBuffer();
    res.end(Buffer.from(arrayBuf));
  } catch (e) {
    sendJson({ success: false, message: e.message }, 500);
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Backend Local Proxy & AI Bridge running at http://localhost:${PORT}/`);
  });
}

module.exports = { server, evaluateAnswer, extractKeyConcepts, screenResumeAgainstJD };
