import prisma from '../prisma';

import { Job, Queue } from '@prisma/client';
import startJob from './startJob';

const REMOTE_GPU_MODE = process.env.REMOTE_GPU_MODE === 'true';
const API2_ENDPOINT = process.env.API2_ENDPOINT || 'http://localhost:5087';

// In remote mode, poll api2 for status updates on running jobs and sync to local SQLite
async function syncRemoteJobStatus() {
  const activeJobs: Job[] = await prisma.job.findMany({
    where: { status: { in: ['running', 'queued'] } },
  });

  for (const job of activeJobs) {
    if (job.status !== 'running') continue;

    try {
      const response = await fetch(
        `${API2_ENDPOINT}/api/AiToolkitProxy/status?jobId=${job.id}`
      );
      if (!response.ok) continue;

      const remote = await response.json();
      const updateData: any = {};

      if (remote.status) updateData.status = remote.status;
      if (remote.step !== undefined) updateData.step = remote.step;
      if (remote.info) updateData.info = remote.info;
      if (remote.speedString) updateData.speed_string = remote.speedString;

      if (Object.keys(updateData).length > 0) {
        await prisma.job.update({
          where: { id: job.id },
          data: updateData,
        });
      }
    } catch (e) {
      // api2 unreachable, skip this cycle
    }
  }
}

export default async function processQueue() {
  // In remote mode, sync status from api2 for running jobs
  if (REMOTE_GPU_MODE) {
    await syncRemoteJobStatus();
  }

  const queues: Queue[] = await prisma.queue.findMany({
    orderBy: {
      id: 'asc',
    },
  });

  for (const queue of queues) {
    if (!queue.is_running) {
      // stop any running jobs first
      const runningJobs: Job[] = await prisma.job.findMany({
        where: {
          status: 'running',
          gpu_ids: queue.gpu_ids,
        },
      });

      for (const job of runningJobs) {
        console.log(`Stopping job ${job.id} on GPU(s) ${job.gpu_ids}`);
        await prisma.job.update({
          where: { id: job.id },
          data: {
            return_to_queue: true,
            info: 'Stopping job...',
          },
        });
      }
    }
    if (queue.is_running) {
      // first see if one is already running, status of running or stopping
      const runningJob: Job | null = await prisma.job.findFirst({
        where: {
          status: { in: ['running', 'stopping'] },
          gpu_ids: queue.gpu_ids,
        },
      });

      if (runningJob) {
        // already running, nothing to do
        continue; // skip to next queue
      } else {
        // find the next job in the queue
        const nextJob: Job | null = await prisma.job.findFirst({
          where: {
            status: 'queued',
            gpu_ids: queue.gpu_ids,
          },
          orderBy: {
            queue_position: 'asc',
          },
        });
        if (nextJob) {
          console.log(`Starting job ${nextJob.id} on GPU(s) ${nextJob.gpu_ids}`);
          await startJob(nextJob.id);
        } else {
          // no more jobs, stop the queue
          console.log(`No more jobs in queue for GPU(s) ${queue.gpu_ids}, stopping queue`);
          await prisma.queue.update({
            where: { id: queue.id },
            data: { is_running: false },
          });
        }
      }
    }
  }
}
