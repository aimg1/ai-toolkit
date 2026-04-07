import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const isWindows = process.platform === 'win32';
const REMOTE_GPU_MODE = process.env.REMOTE_GPU_MODE === 'true';
const API2_ENDPOINT = process.env.API2_ENDPOINT || 'http://localhost:5087';

export async function GET(request: NextRequest, { params }: { params: { jobID: string } }) {
  const { jobID } = await params;

  const job = await prisma.job.findUnique({
    where: { id: jobID },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  await prisma.job.update({
    where: { id: jobID },
    data: {
      stop: true,
      info: 'Stopping job...',
    },
  });

  if (REMOTE_GPU_MODE) {
    // Forward stop to api2 backend
    try {
      await fetch(`${API2_ENDPOINT}/api/AiToolkitProxy/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobID }),
      });
      await prisma.job.update({
        where: { id: jobID },
        data: { status: 'stopped', info: 'Job stopped' },
      });
    } catch (e) {
      console.error('[REMOTE] Error forwarding stop:', e);
    }
  } else {
    // Send SIGINT to the process if we have a PID
    if (job.pid != null) {
      console.log(`Attempting to stop job ${jobID} with PID ${job.pid}`);
      try {
        if (isWindows) {
          const { execSync } = require('child_process');
          execSync(`taskkill /PID ${job.pid} /T /F`, { stdio: 'ignore' });
        } else {
          process.kill(job.pid, 'SIGINT');
        }
        await prisma.job.update({
          where: { id: jobID },
          data: { status: 'stopped', info: 'Job stopped' },
        });
      } catch (e) {
        console.error('Error sending signal to process:', e);
      }
    } else {
      console.warn(`No PID found for job ${jobID}, cannot send stop signal`);
    }
  }

  return NextResponse.json(job);
}
