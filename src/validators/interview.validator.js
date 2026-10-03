import { z } from "zod";

const createReportSchema = z.object({
  selfDescription: z
    .string()
    .trim()
    .min(1, "Self description is required")
    .max(5_000),
  jobDescription: z
    .string()
    .trim()
    .min(1, "Job description is required")
    .max(30_000),
});

export { createReportSchema };
