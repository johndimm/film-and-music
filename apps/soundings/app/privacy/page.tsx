import AudioSilencer from '@/app/components/AudioSilencer'

export const metadata = { title: 'Privacy Policy – Soundings' }

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black text-white">
      <AudioSilencer />
      <div className="max-w-3xl mx-auto px-8 py-12">
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">← Home</a>

        <h1 className="text-3xl font-bold mt-6 mb-2">Privacy Policy</h1>
        <p className="text-zinc-400 text-sm mb-10">Last updated: May 5, 2026</p>

        <section id="overview" className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">Overview</h2>
          <p className="text-zinc-300 leading-relaxed">
            Soundings (formerly Earprint) ("we", "us", "our") is a music discovery application. This policy explains what
            information we collect, how we use it, and your rights regarding that information.
          </p>
        </section>

        <section id="youtube-api" className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">YouTube API Services</h2>
          <p className="text-zinc-300 leading-relaxed mb-3">
            Soundings uses the <strong className="text-white">YouTube API Services</strong> to search for
            and play music videos. By using Soundings's YouTube mode, you are also subject to Google's
            terms and privacy policy:
          </p>
          <ul className="list-disc list-inside text-zinc-300 space-y-1 ml-2">
            <li>
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-400 hover:text-red-300 underline"
              >
                YouTube Terms of Service
              </a>
            </li>
            <li>
              <a
                href="http://www.google.com/policies/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-400 hover:text-red-300 underline"
              >
                Google Privacy Policy
              </a>
            </li>
          </ul>
          <p className="text-zinc-400 text-sm mt-3">
            You can revoke Soundings's access to YouTube data via the{' '}
            <a
              href="https://security.google.com/settings/security/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 hover:text-red-300 underline"
            >
              Google security settings page
            </a>
            .
          </p>
        </section>

        <section id="data-collected" className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">Information We Collect</h2>
          <p className="text-zinc-300 leading-relaxed mb-3">
            When you use Soundings, the following information may be accessed, collected, or stored:
          </p>
          <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-2">
            <li>
              <strong className="text-white">YouTube API Data:</strong> Search queries you submit and
              video metadata (titles, thumbnails, video IDs) returned by the YouTube API. This data is
              used solely to display search results and enable playback.
            </li>
            <li>
              <strong className="text-white">Spotify OAuth tokens:</strong> If you log in with Spotify,
              we store an access token in a browser cookie to maintain your session. We do not store
              your Spotify password or payment information.
            </li>
            <li>
              <strong className="text-white">Playback preferences:</strong> Settings such as your
              preferred music source (Spotify or YouTube) may be stored locally in your browser.
            </li>
            <li>
              <strong className="text-white">Usage data:</strong> We may log API request metadata
              (timestamps, error codes) for debugging and rate-limit management. These logs do not
              contain personally identifiable information.
            </li>
          </ul>
        </section>

        <section id="data-use" className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">How We Use Your Information</h2>
          <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-2">
            <li>To provide and operate the Soundings music discovery service.</li>
            <li>To fulfill YouTube and Spotify API requests on your behalf.</li>
            <li>To maintain your session across page loads (via browser cookies).</li>
            <li>To debug errors and monitor service health.</li>
          </ul>
          <p className="text-zinc-300 leading-relaxed mt-3">
            We do not sell, rent, or trade your information to third parties. We do not use your
            information for advertising purposes. YouTube API Data is not used for any purpose
            beyond providing the features you explicitly request within Soundings.
          </p>
        </section>

        <section id="cookies" className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">Cookies and Local Storage</h2>
          <p className="text-zinc-300 leading-relaxed mb-3">
            Soundings stores information directly on your device using the following mechanisms:
          </p>
          <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-2">
            <li>
              <strong className="text-white">HTTP cookies:</strong> Used to store your Spotify
              authentication token so you remain signed in across page loads. Cookies are scoped to
              this domain and are not used for cross-site tracking.
            </li>
            <li>
              <strong className="text-white">localStorage / sessionStorage:</strong> Used to store
              UI preferences and temporary playback state. This data stays on your device and is
              never transmitted to our servers.
            </li>
          </ul>
          <p className="text-zinc-300 leading-relaxed mt-3">
            No third-party tracking cookies are placed on your device by Soundings itself. Third-party
            services (YouTube, Spotify) may set their own cookies subject to their respective privacy
            policies.
          </p>
        </section>

        <section id="data-sharing" className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">Data Sharing</h2>
          <p className="text-zinc-300 leading-relaxed">
            Your search queries and playback requests are transmitted to the YouTube Data API and/or
            Spotify Web API in order to fulfill those requests. No other sharing of your data with
            external parties occurs. We do not share data with analytics providers, advertisers, or
            data brokers.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">Data Retention</h2>
          <p className="text-zinc-300 leading-relaxed">
            Server-side request logs are retained for a short period for debugging purposes and then
            deleted. Spotify authentication cookies expire when you log out or when the token expires
            (typically within a few hours). Local browser data persists until you clear it manually.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">Children's Privacy</h2>
          <p className="text-zinc-300 leading-relaxed">
            Soundings is not directed at children under 13. We do not knowingly collect personal
            information from children.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">Changes to This Policy</h2>
          <p className="text-zinc-300 leading-relaxed">
            We may update this policy from time to time. Material changes will be reflected by an
            updated date at the top of this page.
          </p>
        </section>

        <section id="contact" className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-zinc-100 border-b border-zinc-800 pb-2">Contact</h2>
          <p className="text-zinc-300 leading-relaxed">
            Questions or concerns about this privacy policy can be directed to:
          </p>
          <ul className="list-disc list-inside text-zinc-300 space-y-1 mt-2 ml-2">
            <li>
              Email:{' '}
              <a href="mailto:john.r.dimm@gmail.com" className="text-zinc-100 hover:text-white underline">
                john.r.dimm@gmail.com
              </a>
            </li>
            <li>
              GitHub:{' '}
              <a
                href="https://github.com/johndimm/film-and-music/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-100 hover:text-white underline"
              >
                github.com/johndimm/film-and-music/issues
              </a>
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
