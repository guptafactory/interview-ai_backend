import { PDFParse } from "pdf-parse";
import interviewReportModel from "./../models/interviewReport.model.js";
import generateReportByAI from "./../services/ai.service.js";
import { AppError } from "../utils/AppError.js";

/** pdf.js (under `pdf-parse`) reports unreadable input as "Invalid PDF ...". */
function isPdfReadError(error) {
  return error instanceof Error && /pdf/i.test(error.message);
}

async function createInterviewReport(req, res) {
  if (!req.file) {
    throw new AppError("A PDF resume is required", 400, "RESUME_REQUIRED");
  }
  let parser;

  try {
    parser = new PDFParse({ data: req.file.buffer });

    const resumeContent = (await parser.getText()).text;
    if (!resumeContent?.trim()) {
      throw new AppError(
        "Could not read any text from the PDF",
        422,
        "EMPTY_PDF_TEXT",
      );
    }

    const { selfDescription, jobDescription } = req.body;

    const interviewReportByAI = await generateReportByAI(
      resumeContent,
      selfDescription,
      jobDescription,
    );

    const interviewReport = await interviewReportModel.create({
      user: req.user.id,
      resumeContent,
      selfDescription,
      jobDescription,
      ...interviewReportByAI,
    });

    return res.status(201).json({
      message: "Interview report generated successfully",
      interviewReport,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;

    if (isPdfReadError(error)) {
      throw new AppError(
        "Uploaded file is not a valid PDF",
        422,
        "INVALID_PDF",
      );
    }

    if (error?.name === "ValidationError") {
      throw new AppError(
        "The AI returned a report that could not be stored",
        502,
        "AI_RESPONSE_INVALID",
      );
    }

    throw error;
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
}

export { createInterviewReport };
