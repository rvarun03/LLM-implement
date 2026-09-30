import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { getProjectCreditSummary, getProjectPlanSync } from '../services/tokenConsumptionService';
import { toast } from 'sonner';

/**
 * Checks if the current or specified project has exhausted its credit pool or is expired/gated.
 */
export const isProjectCreditExhausted = (projectId?: string, projectName?: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const activeProjId = projectId || (window as any).__automatiqa_active_project_id || localStorage.getItem('automatiqa_active_project_id') || undefined;
    const activeProjName = projectName || (window as any).__automatiqa_active_project_name || localStorage.getItem('automatiqa_active_project_name') || undefined;
    const summary = getProjectCreditSummary(activeProjId, activeProjName);
    const plan = getProjectPlanSync(activeProjId, activeProjName);
    return summary.remainingCredits <= 0 || (plan.remainingCredits !== undefined && plan.remainingCredits <= 0) || summary.isGated;
  } catch (e) {
    return false;
  }
};

/**
 * Escapes a cell value for standard CSV (RFC 4180)
 */
export const escapeCsvCell = (val: any): string => {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  // If the cell contains quotes, commas, or newlines, enclose in quotes and double internal quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

/**
 * Converts an array of objects to standard CSV string
 */
export const jsonToCsvString = (data: Record<string, any>[]): string => {
  if (!data || data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const headerRow = headers.map(escapeCsvCell).join(',');
  const rows = data.map(item => 
    headers.map(h => escapeCsvCell(item[h] ?? '')).join(',')
  );
  return [headerRow, ...rows].join('\r\n');
};

/**
 * Fallback browser download trigger using DOM element
 */
const triggerBlobDownloadFallback = (blob: Blob, filename: string) => {
  try {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 1000);
  } catch (err) {
    console.error('[exportUtils] Fallback download failed:', err);
  }
};

/**
 * Downloads data as an Excel (.xlsx) file
 */
export const downloadExcel = (
  data: Record<string, any>[],
  fileName: string,
  sheetName: string = 'Sheet1'
) => {
  if (isProjectCreditExhausted()) {
    toast.error("Project credit limit reached. Export Excel and Export CSV are restricted when available credits are exhausted.", {
      duration: 5000
    });
    return;
  }

  const safeName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

    try {
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8'
      });
      saveAs(blob, safeName);
    } catch (saveAsErr) {
      console.warn('[exportUtils] saveAs failed, attempting XLSX.writeFile fallback:', saveAsErr);
      XLSX.writeFile(wb, safeName);
    }
  } catch (err) {
    console.error('[exportUtils] Failed to generate Excel file:', err);
    throw err;
  }
};

/**
 * Downloads data as a CSV (.csv) file with UTF-8 BOM
 */
export const downloadCsv = (
  data: Record<string, any>[] | string,
  fileName: string
) => {
  if (isProjectCreditExhausted()) {
    toast.error("Project credit limit reached. Export Excel and Export CSV are restricted when available credits are exhausted.", {
      duration: 5000
    });
    return;
  }

  const safeName = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  try {
    const csvContent = typeof data === 'string' ? data : jsonToCsvString(data);
    // Include UTF-8 BOM so Excel and spreadsheet apps display special characters and newlines correctly
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;'
    });

    try {
      saveAs(blob, safeName);
    } catch (saveAsErr) {
      console.warn('[exportUtils] saveAs failed, attempting DOM anchor fallback:', saveAsErr);
      triggerBlobDownloadFallback(blob, safeName);
    }
  } catch (err) {
    console.error('[exportUtils] Failed to generate CSV file:', err);
    throw err;
  }
};
