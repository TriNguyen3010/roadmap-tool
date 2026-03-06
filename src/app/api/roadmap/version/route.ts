import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const ROW_ID = 'main';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('roadmap_data')
            .select('updated_at')
            .eq('id', ROW_ID)
            .single();

        if (error) throw error;

        return NextResponse.json(
            { updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Failed to read roadmap version:', error);
        return NextResponse.json({ error: 'Failed to read roadmap version' }, { status: 500 });
    }
}

