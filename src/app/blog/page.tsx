import { supabase } from "@/lib/supabase";
import Link from "next/link";

export const revalidate = 3600;

export default async function BlogPage() {
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("title, slug, cover_image, created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Blog</h1>
      <div className="space-y-8">
        {posts?.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="block group">
            <h2 className="text-xl font-semibold group-hover:underline">{post.title}</h2>
            <p className="text-sm text-gray-400">
              {new Date(post.created_at).toLocaleDateString("fr-CA")}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
