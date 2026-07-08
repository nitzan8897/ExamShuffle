import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../output/מבחן אבטחת מידע (טופס 0).pdf");
const base = "http://localhost:3000";

const buffer = await readFile(file);
const form = new FormData();
form.append("exams", new Blob([buffer], { type: "application/pdf" }), path.basename(file));

const uploadRes = await fetch(`${base}/api/shuffle`, { method: "POST", body: form });
const { jobs } = (await uploadRes.json()) as { jobs: { jobId: string }[] };
const jobId = jobs[0]!.jobId;
console.log("job:", jobId);

let status = "processing";
while (status === "processing") {
  await new Promise((r) => setTimeout(r, 4000));
  const s = (await (await fetch(`${base}/api/jobs/${jobId}`)).json()) as {
    status: string;
    percent: number;
    error?: string;
  };
  status = s.status;
  console.log(`${s.percent}% ${s.status}${s.error ? " " + s.error : ""}`);
}

if (status !== "done") process.exit(1);

const dl = await fetch(`${base}/api/jobs/${jobId}/download`);
const disposition = dl.headers.get("content-disposition") ?? "";
const body = Buffer.from(await dl.arrayBuffer());
console.log("content-disposition:", disposition);
console.log("pdf header:", body.subarray(0, 5).toString("ascii"));
console.log("size:", body.length);

const utf8Match = disposition.match(/filename\*=UTF-8''(.+)$/);
if (utf8Match) console.log("decoded name:", decodeURIComponent(utf8Match[1]!));
