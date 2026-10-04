import mongoose from "mongoose";
import { PDFParse } from "pdf-parse";
import interviewReportModel from "./../models/interviewReport.model.js";
import {
  generateReportByAI,
  generateResumeHTMLbyAI,
} from "./../services/ai.service.js";
import generatePdfFromHtml from "../utils/htmlToPdf.js";
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

async function getInterviewReportById(req, res) {
  const { reportId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(reportId))
    throw new AppError("Invalid ReportId", 400, "INVALID_REPORT_ID");

  const interviewReport = await interviewReportModel.findOne({
    _id: reportId,
    user: req.user.id,
  });

  if (!interviewReport)
    throw new AppError("No Interview report found", 404, "NO_REPORT_FOUND");

  return res.status(200).json({
    message: "Interview report fetched successfully",
    interviewReport,
  });
}

async function getAllInterviewReports(req, res) {
  const interviewReports = await interviewReportModel
    .find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .select(
      "-resumeContent -selfDescription -jobDescription -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan",
    );

  if (!interviewReports)
    throw new AppError("No Interview reports found", 404, "NO_REPORT_FOUND");

  return res.status(200).json({
    message: "Interview reports fetched successfully",
    interviewReports,
  });
}

async function createResumePDF(req, res) {
  const { reportId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(reportId))
    throw new AppError("Invalid ReportId", 400, "INVALID_REPORT_ID");

  const interviewReport = await interviewReportModel.findById(reportId);

  if (!interviewReport) {
    return res.status(404).json({
      message: "Interview report not found.",
    });
  }

  const { resumeContent, selfDescription, jobDescription } = interviewReport;

  const data = await generateResumeHTMLbyAI(
    resumeContent,
    selfDescription,
    jobDescription,
  );

  const pdfBuffer = await generatePdfFromHtml(data?.html);

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename=resume_${reportId}.pdf`,
  });

  res.send(pdfBuffer);
}

export {
  createInterviewReport,
  getInterviewReportById,
  getAllInterviewReports,
  createResumePDF,
};
