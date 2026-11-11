/**
 * build-unified.js
 * ----------------
 * Zero-dependency build script that compiles all SmartHire portals into
 * a single unified 'dist' directory, ready for 1-click Vercel/Netlify hosting.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function log(msg) {
  console.log(`[SmartHire Build] ${msg}`);
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function ensureDependencies(subDir) {
  const nodeModulesPath = path.join(subDir, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    log(`Installing dependencies in ${path.relative(ROOT_DIR, subDir)}...`);
    execSync('npm install --include=dev', {
      cwd: subDir,
      stdio: 'inherit'
    });
  }
}

try {
  log("Starting Unified Production Build...");

  // 1. Prepare dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 2. Build Candidate Portal
  log("Building Candidate Portal (/candidate)...");
  const candDir = path.join(ROOT_DIR, 'Frontend/smarthire-candidate-frontend');
  ensureDependencies(candDir);
  execSync('npm run build', {
    cwd: candDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE_PATH: '/candidate/' }
  });
  copyRecursiveSync(
    path.join(candDir, 'dist'),
    path.join(DIST_DIR, 'candidate')
  );

  // 3. Build Interviewer Portal
  log("Building Interviewer Portal (/interviewer)...");
  const intDir = path.join(ROOT_DIR, 'Frontend/SmartHire-interviewer-frontend');
  ensureDependencies(intDir);
  execSync('npm run build', {
    cwd: intDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE_PATH: '/interviewer/' }
  });
  copyRecursiveSync(
    path.join(intDir, 'dist'),
    path.join(DIST_DIR, 'interviewer')
  );

  // 4. Build Admin Portal
  log("Building Admin Portal (/admin)...");
  const adminDir = path.join(ROOT_DIR, 'Frontend/smarthire-admin-frontend');
  ensureDependencies(adminDir);
  execSync('npm run build', {
    cwd: adminDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE_PATH: '/admin/' }
  });
  copyRecursiveSync(
    path.join(adminDir, 'dist'),
    path.join(DIST_DIR, 'admin')
  );

  // 5. Copy Gateway (Main Root Entry)
  log("Copying Unified Gateway (/)...");
  fs.copyFileSync(
    path.join(ROOT_DIR, 'Frontend/gateway/index.html'),
    path.join(DIST_DIR, 'index.html')
  );

  // 6. Copy Proctored Exam Portal
  log("Copying Proctored Exam Portal (/proctored-exam)...");
  copyRecursiveSync(
    path.join(ROOT_DIR, 'Frontend/proctored-exam'),
    path.join(DIST_DIR, 'proctored-exam')
  );

  // 7. Write Netlify SPA Redirects (_redirects)
  log("Generating Netlify routing (_redirects)...");
  const netlifyRedirects = [
    '/candidate/*  /candidate/index.html  200',
    '/interviewer/*  /interviewer/index.html  200',
    '/admin/*  /admin/index.html  200',
    '/proctored-exam/*  /proctored-exam/:splat  200',
    '/*  /index.html  200'
  ].join('\n');
  fs.writeFileSync(path.join(DIST_DIR, '_redirects'), netlifyRedirects);

  log("✓ Unified Production Build completed successfully in dist/!");
} catch (err) {
  console.error("Build failed:", err);
  process.exit(1);
}
