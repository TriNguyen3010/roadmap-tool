import { describe, expect, it } from 'vitest';
import { filterVisibleRoadmaps, isHiddenRoadmap } from './roadmapVisibility';

describe('roadmapVisibility', () => {
    it('hides retired roadmap names and ids', () => {
        expect(isHiddenRoadmap({ id: 'main', name: 'Renamed legacy roadmap' })).toBe(true);
        expect(isHiddenRoadmap({ id: 'other', name: ' Roadmap   Super Wallet ' })).toBe(true);
        expect(isHiddenRoadmap({ id: 'e101b240-887a-4b6f-a497-220e0ba25409', name: 'Any name' })).toBe(true);
        expect(isHiddenRoadmap({ id: 'current', name: 'Roadmap Overall' })).toBe(false);
    });

    it('filters hidden roadmaps from list responses', () => {
        const roadmaps = [
            { id: 'main', name: 'Roadmap Super Wallet', updated_at: null },
            { id: 'a8335e0e-55ec-42c9-920f-d64c32825cc8', name: 'Roadmap Overall', updated_at: null },
            { id: 'e101b240-887a-4b6f-a497-220e0ba25409', name: 'Roadmap Demo', updated_at: null },
        ];

        expect(filterVisibleRoadmaps(roadmaps)).toEqual([
            { id: 'a8335e0e-55ec-42c9-920f-d64c32825cc8', name: 'Roadmap Overall', updated_at: null },
        ]);
    });
});
