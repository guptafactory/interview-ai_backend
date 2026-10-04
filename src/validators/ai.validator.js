import { z } from "zod";

const interviewReportZodSchema = z.object({
  matchScore: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "A score between 0 and 100 indicating how well the candidate's profile matches the job description",
    ),

  technicalQuestions: z
    .array(
      z.object({
        question: z
          .string()
          .describe(
            "The technical question that can be asked in the interview",
          ),
        intention: z
          .string()
          .describe("The interviewer's intention behind asking this question"),
        answer: z
          .string()
          .describe(
            "How to answer this question, what points to cover, and what approach to take",
          ),
      }),
    )
    .describe(
      "Technical questions that can be asked in the interview along with their intention and how to answer them",
    ),

  behavioralQuestions: z
    .array(
      z.object({
        question: z
          .string()
          .describe(
            "The behavioral question that can be asked in the interview",
          ),
        intention: z
          .string()
          .describe("The interviewer's intention behind asking this question"),
        answer: z
          .string()
          .describe(
            "How to answer this question, what points to cover, and what approach to take",
          ),
      }),
    )
    .describe(
      "Behavioral questions that can be asked in the interview along with their intention and how to answer them",
    ),

  skillGaps: z
    .array(
      z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z
          .enum(["low", "medium", "high"])
          .describe(
            "The severity of this skill gap based on its importance for the job",
          ),
      }),
    )
    .describe(
      "List of skill gaps in the candidate's profile along with their severity",
    ),

  preparationPlan: z
    .array(
      z.object({
        day: z
          .number()
          .int()
          .min(1)
          .describe("The day number in the preparation plan, starting from 1"),
        focus: z
          .string()
          .describe(
            "The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc.",
          ),
        tasks: z
          .array(z.string())
          .describe(
            "List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.",
          ),
      }),
    )
    .describe("A day-wise preparation plan for the candidate to follow"),

  jobTitle: z
    .string()
    .describe(
      "The title of the job for which the interview report is generated",
    ),
});

const interviewReportJsonSchema = z.toJSONSchema(interviewReportZodSchema);

const resumePdfZodSchema = z.object({
  html: z
    .string()
    .describe("The HTML content of the resume which is to be converted to PDF"),
});

const resumePdfJsonSchema = z.toJSONSchema(resumePdfZodSchema);

export {
  interviewReportZodSchema,
  interviewReportJsonSchema,
  resumePdfZodSchema,
  resumePdfJsonSchema,
};
