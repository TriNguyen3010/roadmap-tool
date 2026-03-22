import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data, error } = await supabase
            .from('roadmap_data')
            .select('updated_at')
            .eq('id', id)
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
