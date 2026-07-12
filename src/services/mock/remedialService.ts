// src/services/mock/remedialService.ts
import { RemedialRecord } from "../../types/remedial";
import { remedialData } from "../../mock-data/remedial";
import { delay } from "../../utils/delay";
import { successResponse, errorResponse, ApiResponse } from "../../utils/response";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";

export const remedialService = {
  async getRemedialRecords(): Promise<ApiResponse<RemedialRecord[]>> {
    return delay(successResponse([...remedialData]), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async createRemedialRecord(newRecord: Omit<RemedialRecord, 'id' | 'createdAt'>): Promise<ApiResponse<RemedialRecord>> {
    const id = `rem-${Date.now()}`;
    const createdAt = new Date().toISOString().split('T')[0];
    const record: RemedialRecord = { ...newRecord, id, createdAt };
    remedialData.push(record);
    return delay(successResponse(record, 'Remedial record created'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async updateRemedialRecord(id: string, updates: Partial<Omit<RemedialRecord, 'id' | 'createdAt'>>): Promise<ApiResponse<RemedialRecord>> {
    const idx = remedialData.findIndex((r) => r.id === id);
    if (idx === -1) return delay(errorResponse<RemedialRecord>('Remedial record not found'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
    const updated = { ...remedialData[idx], ...updates } as RemedialRecord;
    remedialData[idx] = updated;
    return delay(successResponse(updated, 'Remedial record updated'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async archiveRemedialRecord(id: string): Promise<ApiResponse<RemedialRecord>> {
    return this.updateRemedialRecord(id, { status: 'archived' } as Partial<RemedialRecord>);
  },

  async restoreRemedialRecord(id: string): Promise<ApiResponse<RemedialRecord>> {
    // restore to 'open' status
    return this.updateRemedialRecord(id, { status: 'open' } as Partial<RemedialRecord>);
  },
};
