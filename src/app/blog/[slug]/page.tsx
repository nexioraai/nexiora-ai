import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";

export const revalidate = 3600;

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: post } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .single();

  if (!post) notFound();

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-4">{post.title}</h1>
      <p className="text-sm text-gray-400 mb-8">
        {new Date(post.created_at).toLocaleDateString("fr-CA")}
      </p>
      <article className="prose prose-invert max-w-none">{post.content}</article>
    </main>
  );
}
