import { useParams, Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import RecipeMarkdown from "@/components/RecipeMarkdown";
import { getRecipe } from "@/data/repository";

const PublicRecipe = () => {
  const { slug } = useParams<{ slug: string }>();
  const recipe = slug ? getRecipe(slug) : undefined;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Icon name="Boxes" size={20} className="text-violet-400" />
          <h1 className="text-lg sm:text-xl font-semibold">
            {recipe ? recipe.title : "Рецепт"}
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        {recipe ? (
          <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
            <RecipeMarkdown text={recipe.content} />
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.08] bg-card p-8 text-center">
            <Icon name="SearchX" size={40} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Рецепт не найден или снят с публикации.</p>
            <Link to="/" className="text-primary text-sm mt-3 inline-block">На главную</Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicRecipe;
