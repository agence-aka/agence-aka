
'use client';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// Non typé : les types de src/lib/types.ts sont incomplets (pas de Relationships)
// et rendaient toutes les requêtes `never` avec supabase-js 2.4x+.
export const supabase = createClientComponentClient()
