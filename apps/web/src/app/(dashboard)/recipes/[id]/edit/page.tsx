'use client';

import { useParams } from 'next/navigation';
import { RecipeForm } from '@/components/recipe-form';

export default function EditRecipePage() {
  const { id } = useParams<{ id: string }>();
  return <RecipeForm recipeId={id} />;
}
