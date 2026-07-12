import { productionStatusUiModel } from './production-status-ui-model-v1.js';
import { installationStatusUiModel } from './installation-status-ui-model-v1.js';

const PRODUCTION_DONE_KEYS = new Set(['ready', 'issued', 'not_required', 'cancelled']);

function freezeModel(model, done) {
  return Object.freeze({
    ...model,
    done: done === true,
    unknown: model.known !== true
  });
}

export function productionBoardStatus(value) {
  const model = productionStatusUiModel(value);
  return freezeModel(model, model.known === true && PRODUCTION_DONE_KEYS.has(model.key));
}

export function installationBoardStatus(value) {
  const model = installationStatusUiModel(value);
  return freezeModel(model, model.known === true && model.terminal === true);
}

export function boardStatus(kind, value) {
  return kind === 'installation' ? installationBoardStatus(value) : productionBoardStatus(value);
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function isBoardDateOverdue(value, done, nowValue = Date.now()) {
  if (done) return false;
  const date = dateValue(value);
  if (!date) return false;
  date.setHours(23, 59, 59, 999);
  return date.getTime() < Number(nowValue);
}

export function isBoardDateToday(value, done, nowValue = Date.now()) {
  if (done) return false;
  const date = dateValue(value);
  if (!date) return false;
  const now = new Date(Number(nowValue));
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function productionBoardMetrics(production = [], installation = [], nowValue = Date.now()) {
  const counts = {
    productionOpen: 0,
    installationOpen: 0,
    overdueProduction: 0,
    overdueInstallation: 0,
    todayProduction: 0,
    todayInstallation: 0,
    unknownProduction: 0,
    unknownInstallation: 0
  };

  production.forEach((job) => {
    const status = productionBoardStatus(job?.production_status);
    if (!status.done) counts.productionOpen += 1;
    if (status.unknown) counts.unknownProduction += 1;
    if (isBoardDateOverdue(job?.deadline, status.done, nowValue)) counts.overdueProduction += 1;
    else if (isBoardDateToday(job?.deadline, status.done, nowValue)) counts.todayProduction += 1;
  });

  installation.forEach((job) => {
    const status = installationBoardStatus(job?.install_status);
    if (!status.done) counts.installationOpen += 1;
    if (status.unknown) counts.unknownInstallation += 1;
    if (isBoardDateOverdue(job?.scheduled_at, status.done, nowValue)) counts.overdueInstallation += 1;
    else if (isBoardDateToday(job?.scheduled_at, status.done, nowValue)) counts.todayInstallation += 1;
  });

  return Object.freeze(counts);
}
