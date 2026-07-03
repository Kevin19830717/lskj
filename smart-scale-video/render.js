const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION = 150; 
const TOTAL_FRAMES = FPS * DURATION;

async function renderVideo() {
  console.log(`Starting video render: ${WIDTH}x${HEIGHT}, ${FPS}fps, ${DURATION}s (${TOTAL_FRAMES} frames)`);
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  
  const page = await context.newPage();
  
  const htmlPath = path.resolve(__dirname, 'index.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(1000);
  
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    '-r', FPS.toString(),
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '23',
    '-movflags', '+faststart',
    path.resolve(__dirname, 'output.mp4')
  ]);
  
  ffmpeg.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('frame=')) {
      process.stdout.write(`\r${msg.trim()}`);
    }
  });
  
  ffmpeg.on('close', (code) => {
    console.log(`\nFFmpeg exited with code ${code}`);
  });
  
  console.log('Rendering frames...');
  
  const startTime = Date.now();
  
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const time = i / FPS;
    
    await page.evaluate((t) => {
      if (window.__timelines && window.__timelines['smart-scale']) {
        window.__timelines['smart-scale'].seek(t);
      }
    }, time);
    
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
    });
    
    ffmpeg.stdin.write(screenshot);
    
    if (i % 30 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const fps = i / elapsed;
      const remaining = (TOTAL_FRAMES - i) / fps;
      process.stdout.write(`\rFrame ${i}/${TOTAL_FRAMES} (${(i/TOTAL_FRAMES*100).toFixed(1)}%) | ${fps.toFixed(1)} fps | ETA: ${remaining.toFixed(0)}s`);
    }
  }
  
  ffmpeg.stdin.end();
  
  await new Promise((resolve) => {
    ffmpeg.on('close', resolve);
  });
  
  await browser.close();
  
  const endTime = Date.now();
  console.log(`\nRender complete! Total time: ${((endTime - startTime) / 1000).toFixed(1)}s`);
  
  const stats = fs.statSync(path.resolve(__dirname, 'output.mp4'));
  console.log(`Output file: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
}

renderVideo().catch(console.error);
