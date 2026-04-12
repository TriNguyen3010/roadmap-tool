import { describe, expect, it } from 'vitest';
import type { RoadmapDocument } from '@/types/roadmap';
import {
    buildViewSettingsStorageKey,
    parseStoredViewSettings,
    stripViewSettingsFromDocument,
} from './roadmapViewSettings';

describe('roadmapViewSettings', () => {
    it('strips settings from the shared document payload', () => {
        const document: RoadmapDocument = {
            releaseName: 'Roadmap A',
            startDate: '',
            endDate: '',
            milestones: [],
            settings: {
                beforeMonths: 2,
                afterMonths: 2,
                timelineOnly: true,
            },
            items: [],
        };

        expect(stripViewSettingsFromDocument(document)).toEqual({
            releaseName: 'Roadmap A',
            startDate: '',
            endDate: '',
            milestones: [],
            items: [],
        });
    });

    it('parses stored settings only when json is valid object data', () => {
        expect(parseStoredViewSettings(null)).toBeNull();
        expect(parseStoredViewSettings('not-json')).toBeNull();
        expect(parseStoredViewSettings('[]')).toBeNull();
        expect(parseStoredViewSettings('{"timelineOnly":true,"beforeMonths":3}')).toEqual({
            timelineOnly: true,
            beforeMonths: 3,
        });
    });

    it('builds a stable settings storage key', () => {
        expect(buildViewSettingsStorageKey('roadmap-1', 'tri@example.com')).toBe('roadmap-view-settings:roadmap-1:tri@example.com');
    });
});
