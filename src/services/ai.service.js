import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

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

  title: z
    .string()
    .describe(
      "The title of the job for which the interview report is generated",
    ),
});

const interviewReportJsonSchema = z.toJSONSchema(interviewReportZodSchema);

async function generateInterviewReport(
  resume,
  selfDescription,
  jobDescription,
) {
  const prompt = `
        Generate an interview preparation report for the candidate.

        Candidate Resume:
        ${resume}

        Candidate Self Description:
        ${selfDescription}

        Job Description:
        ${jobDescription}

        Analyze the candidate against the job description and generate:
        1. A match score from 0-100.
        2. Technical interview questions.
        3. Behavioral interview questions.
        4. Skill gaps.
        5. A practical day-wise preparation plan with doable tasks.

        The questions and preparation plan should be specific to this candidate and this job description.`;

  const interaction = await ai.interactions.create({
    model: "gemini-3.5-flash-lite",

    input: prompt,

    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: interviewReportJsonSchema,
    },
  });

  const validatedReport = interviewReportZodSchema.parse(
    JSON.parse(interaction.output_text),
  );

  console.log(JSON.stringify(validatedReport, null, 2));
  return validatedReport;
}

export default generateInterviewReport;
