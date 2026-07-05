# Distributed Job Scheduler

This project is a platform for managing and executing background tasks reliably across multiple concurrent workers. It provides queue management, configurable retry strategies, failure tracking via a dead letter queue, and time-based job scheduling. The system allows you to submit immediate, delayed, or recurring cron jobs, group them into batches, and monitor their status in real-time.

## Architecture

The platform is designed around three main layers, using PostgreSQL as the single source of truth for both data persistence and task coordination without relying on external message brokers or Redis. An Express API server handles client requests, user authentication, and system metrics. Independent worker processes poll PostgreSQL to claim jobs atomically using database-level locking. Within the API process, a reconciler periodically checks for stale worker heartbeats to recover aborted tasks, and a scheduler promotes delayed or cron-based jobs. The frontend dashboard connects to the API to visualize queue depths, worker utilization, and job timelines.

## Setup Instructions

To get the project set up on your machine, start by cloning the repository and installing the dependencies for both the backend and frontend components.

First, navigate into the backend directory and install the required packages:

```bash
cd backend
npm install
```

Next, navigate into the frontend directory to install its packages:

```bash
cd ../frontend
npm install
```

After installing the packages, you need to set up your environment variables. Create a file named `.env` in the `backend/` directory. You can use the values below as a reference to configure how the API and workers communicate with the database and authorize clients.

## Environment Variables

The backend application looks for the following environment variables in `backend/.env`:

* `DATABASE_URL`: The PostgreSQL database connection URI (SSL mode is required).
* `JWT_SECRET`: A secure key used to sign and verify JSON Web Tokens for client authentication.
* `PORT`: The port number the Express API server will listen on (default is 3000).
* `NODE_ENV`: The environment phase the app is running in (development or production).
* `WORKER_POLL_INTERVAL_MS`: How long workers wait between database polls in milliseconds (default is 1000).
* `HEARTBEAT_INTERVAL_MS`: How often workers write heartbeat statistics to the database in milliseconds (default is 5000).
* `STALE_HEARTBEAT_TIMEOUT_MS`: The threshold in milliseconds after which a worker is considered offline if no heartbeat is received (default is 30000).
* `RECONCILER_INTERVAL_MS`: How often the API server checks for stale workers to recover lost jobs (default is 15000).
* `WORKER_CONCURRENCY`: The maximum number of jobs a worker process can run concurrently (default is 5).

## Running Database Migrations

Before running the application for the first time, you must run the database migrations. This creates the normalized tables, status enums, indexes, and triggers required by the scheduler. 

Run the migration script from the backend directory:

```bash
cd backend
node src/migrate.js
```

## Running the Services

To run the complete platform, you need to start the API server, at least one worker process, and the frontend development server. These need to run simultaneously, so you will need to keep three separate terminal windows open.

In your first terminal, start the Express API server:

```bash
cd backend
npm run start
```

In your second terminal, start the worker process to begin claiming and executing jobs:

```bash
cd backend
npm run worker
```

In your third terminal, start the Vite React development server for the user interface:

```bash
cd frontend
npm run dev
```

The dashboard will be accessible locally at the address output by Vite (typically http://localhost:5173 or http://localhost:5174 if the port is occupied).

## Verifying the Installation

To verify that everything is running as expected, open the dashboard in your browser and register a new account. Once logged in, go to the Queues page and create a new queue. Then, head to the Job Explorer page and click New Job. Submit a job with a simulated type such as `email_send` or `image_processing` and click Create. If your worker process is running, you will see the job transition from queued to running, and finally completed directly on the dashboard timeline.

## Known Limitations and Future Work

* **Workflow Dependencies**: Although the database schema includes a `depends_on` column to support task chains, the worker claiming queries do not currently check if dependencies are complete before claiming a job.
* **Rate Limiting**: A `rate_limit_counters` table is defined in the database schema, but rate limit enforcement has not been integrated into the task claiming loop or the job submission API.
* **CPU Metric Collection**: Worker heartbeats write CPU utilization as a placeholder value of 0, as real-time OS-level CPU metrics gathering is not fully hooked up in the heartbeat loop.
