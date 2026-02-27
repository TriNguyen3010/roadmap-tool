import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const ROW_ID = 'main';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('roadmap_data')
            .select('content')
            .eq('id', ROW_ID)
            .single();

        if (error) throw error;

        return NextResponse.json(data.content);
    } catch (error) {
        console.error('Failed to read roadmap:', error);
        return NextResponse.json({ error: 'Failed to read roadmap data' }, { status: 500 });
    }
}
