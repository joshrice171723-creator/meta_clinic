import type {
  Appointment,
  ClinicWorkspaceContext,
  EncounterCompletionResponse,
  EncounterCompletionReview,
  EncounterDetail,
  FacilityRoom,
  NurseWorkspace,
  Observation,
  Pagination as PageInfo,
  PatientCareSummary,
  Patient,
} from "../../api/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, currentLoginDestination } from "../../api/client";
import { type VisitModality } from "./TelehealthBookingFormat";
import {
  Alert,
  Box,
  Button,
  Card as MuiCard,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Link,
  MenuItem,
  Pagination as MuiPagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Card, ErrorMessage, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import {
  CareIndicators,
  careIndicatorGroups,
  type CareSummaryLoadState,
} from "./CareIndicators";
import { VisitInstructionHandout } from "../../shared/VisitInstructionHandout";
import { PatientClinicalHistory } from "./PatientClinicalHistory";
import { patientReferenceLabel } from "./patientReference";
import { PatientLabReports } from "./PatientLabReports";
import { MedicationAdministrations } from "./MedicationAdministrations";
import { EncounterFollowUpPanel } from "./EncounterFollowUp";
import { PsychotherapyNotePanel } from "./PsychotherapyNotePanel";
import {
  NurseEncounterWorkspace,
  NurseEncounterWorkspaceContent,
  type FacilityRoomsResource,
  type NurseWorkspaceResource,
} from "./NurseEncounterWorkspace";
import { PatientEducationPanel } from "./PatientEducationPanel";
import { ClinicalPlanWorkspace } from "./ClinicalPlanWorkspace";
import { ClinicSchedule } from "./ClinicSchedule";
import { BookedSchedulingResources } from "./SchedulingResourceAvailability";
import {
  patientDisplayLabel,
  encounterDetailPath,
  operationReceiptPath,
  closeRequestKey,
  closeRequestBody,
  closeFailureState,
  receiptResolution,
  encounterCloseMatches,
  encounterHasSignedSoapNote,
  type OperationReceipt,
  clinicDateTime,
  siteLabel,
  statusLabel,
  chartStateLabel,
  patientAge,
  patientSexLabel,
  observationByLabel,
  bloodPressureValue,
  statusColor,
  bookingAvailability,
  observationValue,
  observationLabel,
} from "./careFlowState";
import { BookingForm } from "./CareBookingForm";
import { SoapNoteWorkspace } from "./CareSoapNoteWorkspace";

