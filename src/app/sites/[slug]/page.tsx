import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPhotos, getVideo } from '@/lib/pexels';

export default async function SitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: site } = await supabase
    .from('sites')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!site) return notFound();

  const color = site.primary_color || '#3b82f6';

  const social = site.social_links || {};

  const query = site.type || site.name;

  const testimonials = site.testimonials || [];

  const contact = site.contact || {};

  const [heroVideo, photos] = await Promise.all([
    getVideo(query),
    getPhotos(query, 6),
  ]);

  return (
    <div
      style={{
        fontFamily: 'sans-serif',
        background: '#ffffff',
      }}
    >
      {/* NAVBAR */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(10px)',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Link
          href={`/sites/${slug}`}
          style={{
            color: 'white',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            textDecoration: 'none',
          }}
        >
          {site.name}
        </Link>

        <div
          style={{
            display: 'flex',
            gap: '1.5rem',
          }}
        >
          <a href="#about" style={{ color: 'white', textDecoration: 'none' }}>
            About
          </a>

          <a href="#services" style={{ color: 'white', textDecoration: 'none' }}>
            Services
          </a>

          <a href="#gallery" style={{ color: 'white', textDecoration: 'none' }}>
            Gallery
          </a>

          <a href="#contact" style={{ color: 'white', textDecoration: 'none' }}>
            Contact
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          overflow: 'hidden',
          padding: '2rem',
        }}
      >
        {heroVideo ? (
          <video
            autoPlay
            muted
            loop
            playsInline
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 0,
            }}
          >
            <source src={heroVideo} type="video/mp4" />
          </video>
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(135deg, ${color}, #000)`,
            }}
          />
        )}

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 1,
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            maxWidth: '900px',
          }}
        >
          <span
            style={{
              background: color,
              color: 'white',
              padding: '0.4rem 1rem',
              borderRadius: '999px',
              fontSize: '0.9rem',
            }}
          >
            {site.type}
          </span>

          <h1
            style={{
              fontSize: '5rem',
              fontWeight: '900',
              color: 'white',
              marginTop: '1.5rem',
              marginBottom: '1rem',
              lineHeight: 1,
            }}
          >
            {site.hero_title || site.name}
          </h1>

          <p
            style={{
              fontSize: '1.4rem',
              color: '#ddd',
              marginBottom: '2rem',
              lineHeight: 1.6,
            }}
          >
            {site.hero_subtitle || site.slogan}
          </p>

          <Link
            href="#contact"
            style={{
              background: color,
              color: 'white',
              padding: '1rem 2.5rem',
              borderRadius: '12px',
              fontWeight: '700',
              textDecoration: 'none',
              fontSize: '1.1rem',
            }}
          >
            {site.cta}
          </Link>
        </div>
      </section>

      {/* ABOUT */}
      <section
        id="about"
        style={{
          padding: '6rem 2rem',
          maxWidth: '1100px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontSize: '3rem',
            fontWeight: '900',
            marginBottom: '1.5rem',
          }}
        >
          About {site.name}
        </h2>

        <p
          style={{
            fontSize: '1.15rem',
            color: '#555',
            lineHeight: 1.9,
            maxWidth: '850px',
            margin: '0 auto',
          }}
        >
          {site.about}
        </p>
      </section>

      {/* SERVICES */}
      <section
        id="services"
        style={{
          padding: '6rem 2rem',
          background: '#f8fafc',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: '3rem',
            fontWeight: '900',
            marginBottom: '3rem',
          }}
        >
          Our Services
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(250px,1fr))',
            gap: '1.5rem',
            maxWidth: '1200px',
            margin: '0 auto',
          }}
        >
          {(site.services || []).map(
            (service: string, i: number) => (
              <div
                key={i}
                style={{
                  background: 'white',
                  borderRadius: '18px',
                  padding: '2rem',
                  boxShadow:
                    '0 10px 30px rgba(0,0,0,0.08)',
                  fontWeight: '700',
                  fontSize: '1.1rem',
                  borderTop: `5px solid ${color}`,
                }}
              >
                ✓ {service}
              </div>
            )
          )}
        </div>
      </section>

      {/* GALLERY */}
      <section
        id="gallery"
        style={{
          padding: '6rem 2rem',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: '3rem',
            fontWeight: '900',
            marginBottom: '3rem',
          }}
        >
          Gallery
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(280px,1fr))',
            gap: '1rem',
            maxWidth: '1300px',
            margin: '0 auto',
          }}
        >
          {photos.map((photo, i) => (
            <img
              key={i}
              src={photo}
              alt=""
              style={{
                width: '100%',
                height: '280px',
                objectFit: 'cover',
                borderRadius: '18px',
              }}
            />
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section
        style={{
          padding: '6rem 2rem',
          background: '#f8fafc',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: '3rem',
            fontWeight: '900',
            marginBottom: '3rem',
          }}
        >
          Testimonials
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(280px,1fr))',
            gap: '1.5rem',
            maxWidth: '1200px',
            margin: '0 auto',
          }}
        >
          {testimonials.map((t: any, i: number) => (
            <div
              key={i}
              style={{
                background: 'white',
                padding: '2rem',
                borderRadius: '18px',
                boxShadow:
                  '0 10px 30px rgba(0,0,0,0.08)',
              }}
            >
              <div
                style={{
                  fontSize: '1.2rem',
                  marginBottom: '1rem',
                }}
              >
                ★★★★★
              </div>

              <p
                style={{
                  color: '#555',
                  lineHeight: 1.8,
                  marginBottom: '1rem',
                }}
              >
                {t.text}
              </p>

              <strong>{t.name}</strong>
            </div>
          ))}
        </div>
      </section>

      {/* CONTACT */}
      <section
        id="contact"
        style={{
          padding: '6rem 2rem',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontSize: '3rem',
            fontWeight: '900',
            marginBottom: '2rem',
          }}
        >
          Contact Us
        </h2>

        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto',
            background: '#f8fafc',
            padding: '3rem',
            borderRadius: '24px',
          }}
        >
          {contact.phone && (
            <p
              style={{
                marginBottom: '1rem',
                fontSize: '1.1rem',
              }}
            >
              📞 {contact.phone}
            </p>
          )}

          {contact.email && (
            <p
              style={{
                marginBottom: '1rem',
                fontSize: '1.1rem',
              }}
            >
              📧 {contact.email}
            </p>
          )}

          {contact.address && (
            <p
              style={{
                marginBottom: '2rem',
                fontSize: '1.1rem',
              }}
            >
              📍 {contact.address}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            {social.instagram && (
              <a
                href={`https://instagram.com/${social.instagram}`}
                style={{
                  background: '#E1306C',
                  color: 'white',
                  padding: '0.8rem 1.4rem',
                  borderRadius: '10px',
                  textDecoration: 'none',
                }}
              >
                Instagram
              </a>
            )}

            {social.facebook && (
              <a
                href={`https://facebook.com/${social.facebook}`}
                style={{
                  background: '#1877F2',
                  color: 'white',
                  padding: '0.8rem 1.4rem',
                  borderRadius: '10px',
                  textDecoration: 'none',
                }}
              >
                Facebook
              </a>
            )}

            {social.whatsapp && (
              <a
                href={`https://wa.me/${social.whatsapp}`}
                style={{
                  background: '#25D366',
                  color: 'white',
                  padding: '0.8rem 1.4rem',
                  borderRadius: '10px',
                  textDecoration: 'none',
                }}
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          background: color,
          color: 'white',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <p>© 2026 {site.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}