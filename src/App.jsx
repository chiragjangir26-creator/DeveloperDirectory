import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = "https://api.github.com/search/users";
const CACHE_KEY = "devdirectory_github_profiles_v2";
const CACHE_TIME = 30 * 60 * 1000;
const PAGE_SIZE = 6;

// ---------------- ICON ----------------

function Icon({ children, className = "" }) {
  return (
    <span aria-hidden="true" className={`icon ${className}`}>
      {children}
    </span>
  );
}

// ---------------- CACHE ----------------

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cache = JSON.parse(raw);

    if (
      !cache ||
      !Array.isArray(cache.profiles) ||
      Date.now() - cache.timestamp > CACHE_TIME
    ) {
      return null;
    }

    return cache;
  } catch {
    return null;
  }
}

function saveCache(profiles, nextPage) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        profiles,
        nextPage,
      })
    );
  } catch {
    // The app will continue working if storage is unavailable.
  }
}

// ---------------- GITHUB API ----------------

async function githubFetch(url, signal) {
  const response = await fetch(url, { signal });

  if (response.status === 403 || response.status === 429) {
    throw new Error(
      "GitHub API rate limit reached. Please wait a little and try again."
    );
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}

async function fetchDeveloper(user, signal) {
  const username = user.login;

  // Fetch complete public profile and repositories.
  const [profileResult, reposResult] = await Promise.allSettled([
    githubFetch(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
      signal
    ),
    githubFetch(
      `https://api.github.com/users/${encodeURIComponent(
        username
      )}/repos?sort=updated&per_page=5&type=owner`,
      signal
    ),
  ]);

  if (signal.aborted) {
    throw new DOMException("Request aborted", "AbortError");
  }

  const profile =
    profileResult.status === "fulfilled" ? profileResult.value : user;

  const repositories =
    reposResult.status === "fulfilled" &&
    Array.isArray(reposResult.value)
      ? reposResult.value
      : [];

  const skills = [
    ...new Set(
      repositories
        .map((repo) => repo.language)
        .filter(Boolean)
    ),
  ];

  return {
    id: profile.id ?? user.id,
    name: profile.name || profile.login || username,
    username: profile.login || username,
    role: profile.company || "GitHub Developer",
    company: profile.company || "",
    location: profile.location || "Location not provided",
    email: profile.email || "",
    blog: profile.blog || "",
    avatarUrl: profile.avatar_url || user.avatar_url || "",
    github: profile.html_url || user.html_url,
    bio: profile.bio || "No public bio available.",
    followers: profile.followers ?? 0,
    following: profile.following ?? 0,
    publicRepos: profile.public_repos ?? 0,
    skills,
    experience: `${profile.public_repos ?? 0} public repos`,
    repos: repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      html_url: repo.html_url,
      description: repo.description || "No description available.",
      language: repo.language || "Not specified",
      stargazers_count: repo.stargazers_count ?? 0,
      forks_count: repo.forks_count ?? 0,
    })),
  };
}

async function fetchDevelopers(page, signal) {
  const query = new URLSearchParams({
    q: "location:india type:user",
    per_page: String(PAGE_SIZE),
    page: String(page),
  });

  const data = await githubFetch(
    `${API_URL}?${query.toString()}`,
    signal
  );

  if (!Array.isArray(data.items)) {
    throw new Error("Unexpected response from GitHub.");
  }

  // Do not send too many requests at once.
  const profiles = await Promise.all(
    data.items.map((user) => fetchDeveloper(user, signal))
  );

  return {
    profiles,
    hasMore: data.items.length === PAGE_SIZE,
  };
}

// ---------------- DEVELOPER CARD ----------------

function DeveloperCard({ person }) {
  const [avatarFailed, setAvatarFailed] = useState(false);

  const initials = (person.name || person.username || "Dev")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <article className="dev-card">
      <div className="card-topline" />

      <div className="profile-head">
        <div className="avatar-wrap">
          {avatarFailed || !person.avatarUrl ? (
            <div className="avatar-fallback">{initials}</div>
          ) : (
            <img
              className="avatar"
              src={person.avatarUrl}
              alt={`Profile of ${person.name}`}
              loading="lazy"
              onError={() => setAvatarFailed(true)}
            />
          )}
        </div>

        <div className="person-title">
          <h2>{person.name}</h2>
          <p>{person.role}</p>

          <a
            className="github-username"
            href={person.github}
            target="_blank"
            rel="noreferrer"
          >
            @{person.username}
          </a>
        </div>

        <span className="status">
          <i />
          GitHub
        </span>
      </div>

      <p className="bio">{person.bio}</p>

      <div className="details">
        <div className="detail-row">
          <Icon>⌖</Icon>
          <span>{person.location}</span>
        </div>

        {person.company && (
          <div className="detail-row">
            <Icon>▣</Icon>
            <span>{person.company}</span>
          </div>
        )}

        {person.email && (
          <div className="detail-row">
            <Icon>✉</Icon>
            <a href={`mailto:${person.email}`}>{person.email}</a>
          </div>
        )}

        {person.blog && (
          <div className="detail-row">
            <Icon>↗</Icon>
            <a
              href={
                /^https?:\/\//i.test(person.blog)
                  ? person.blog
                  : `https://${person.blog}`
              }
              target="_blank"
              rel="noreferrer"
            >
              Website / Blog
            </a>
          </div>
        )}
      </div>

      <div className="skills-section">
        <h3 className="skills-heading">Languages</h3>

        <div className="skills-list">
          {person.skills.length > 0 ? (
            person.skills.map((item) => (
              <span className="skill-tag" key={item}>
                {item}
              </span>
            ))
          ) : (
            <span className="skill-tag">Not available</span>
          )}
        </div>
      </div>

      <div className="github-stats">
        <span>👥 {person.followers} followers</span>
        <span>↗ {person.following} following</span>
        <span>📦 {person.publicRepos} public repos</span>
      </div>

      <div className="repo-list">
        <h3>Recently updated repositories</h3>

        {person.repos.length > 0 ? (
          person.repos.map((repo) => (
            <a
              className="repo-link"
              href={repo.html_url}
              target="_blank"
              rel="noreferrer"
              key={repo.id}
            >
              <span>
                <strong>{repo.name}</strong>

                <small>
                  {repo.description}
                  {" · "}
                  {repo.language}
                  {" · "}
                  ★ {repo.stargazers_count}
                  {" · "}
                  Forks {repo.forks_count}
                </small>
              </span>

              <span aria-label="Open repository">↗</span>
            </a>
          ))
        ) : (
          <p>
            No public repositories could be loaded. Visit the GitHub
            profile to explore available projects.
          </p>
        )}
      </div>

      <div className="card-bottom">
        <span className="experience">
          <Icon>▣</Icon>
          {person.experience}
        </span>

        <a
          className="profile-link"
          href={person.github}
          target="_blank"
          rel="noreferrer"
        >
          View GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

// ---------------- MAIN APP ----------------

export default function App() {
  const [initialCache] = useState(() => readCache());

  const [developers, setDevelopers] = useState(
    () => initialCache?.profiles ?? []
  );

  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All locations");
  const [skill, setSkill] = useState("All skills");
  const [repoRange, setRepoRange] = useState("Any repo count");
  const [sort, setSort] = useState("Name (A–Z)");

  const [apiStatus, setApiStatus] = useState(
    initialCache ? "cached" : "loading"
  );

  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const [nextPage, setNextPage] = useState(
    initialCache?.nextPage ?? 2
  );

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Initial load / retry.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadInitialDevelopers() {
      setError("");

      // Keep cached profiles on screen while refreshing.
      if (developers.length === 0) {
        setApiStatus("loading");
      }

      try {
        const cached = readCache();

        if (cached && retryKey === 0) {
          if (active) {
            setDevelopers(cached.profiles);
            setNextPage(cached.nextPage ?? 2);
            setApiStatus("cached");
          }
          return;
        }

        const result = await fetchDevelopers(1, controller.signal);

        if (!active) return;

        setDevelopers(result.profiles);
        setNextPage(2);
        setHasMore(result.hasMore);
        setApiStatus("online");

        saveCache(result.profiles, 2);
      } catch (err) {
        if (!active || err.name === "AbortError") return;

        console.error("GitHub API error:", err);
        setError(err.message || "Unable to load GitHub profiles.");
        setApiStatus("offline");
      }
    }

    loadInitialDevelopers();

    return () => {
      active = false;
      controller.abort();
    };

    // Initial load runs on mount and when Retry is clicked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  // Load additional profiles without removing existing profiles.
  async function loadMoreDevelopers() {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    setError("");

    const controller = new AbortController();

    try {
      const result = await fetchDevelopers(nextPage, controller.signal);

      setDevelopers((current) => {
        const existingIds = new Set(current.map((person) => person.id));

        const newProfiles = result.profiles.filter(
          (person) => !existingIds.has(person.id)
        );

        const updatedProfiles = [...current, ...newProfiles];

        saveCache(updatedProfiles, nextPage + 1);

        return updatedProfiles;
      });

      setNextPage((page) => page + 1);
      setHasMore(result.hasMore);
      setApiStatus("online");
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Load more error:", err);
        setError(err.message || "Could not load more developers.");
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const allLocations = useMemo(
    () =>
      [
        ...new Set(
          developers
            .map((person) => person.location)
            .filter((item) => item !== "Location not provided")
        ),
      ].sort(),
    [developers]
  );

  const allSkills = useMemo(
    () => [...new Set(developers.flatMap((person) => person.skills))].sort(),
    [developers]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    const result = developers.filter((person) => {
      const searchable = [
        person.name,
        person.username,
        person.role,
        person.location,
        person.email,
        person.company,
        person.bio,
        person.blog,
        ...person.skills,
        ...person.repos.map((repo) => repo.name),
        ...person.repos.map((repo) => repo.description),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || searchable.includes(term);

      const matchesLocation =
        location === "All locations" || person.location === location;

      const matchesSkill =
        skill === "All skills" || person.skills.includes(skill);

      const matchesRepoRange =
        repoRange === "Any repo count" ||
        (repoRange === "0–10 repos" && person.publicRepos <= 10) ||
        (repoRange === "11–50 repos" &&
          person.publicRepos >= 11 &&
          person.publicRepos <= 50) ||
        (repoRange === "51+ repos" && person.publicRepos >= 51);

      return (
        matchesSearch &&
        matchesLocation &&
        matchesSkill &&
        matchesRepoRange
      );
    });

    return [...result].sort((a, b) => {
      if (sort === "Name (Z–A)") {
        return b.name.localeCompare(a.name);
      }

      if (sort === "Most followers") {
        return b.followers - a.followers;
      }

      if (sort === "Most repositories") {
        return b.publicRepos - a.publicRepos;
      }

      return a.name.localeCompare(b.name);
    });
  }, [developers, search, location, skill, repoRange, sort]);

  function clearFilters() {
    setSearch("");
    setLocation("All locations");
    setSkill("All skills");
    setRepoRange("Any repo count");
    setSort("Name (A–Z)");
  }

  function retryFetch() {
    setRetryKey((key) => key + 1);
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-purple" />
      <div className="ambient ambient-cyan" />

      <header className="navbar">
        <a className="brand" href="#home" aria-label="DevDirectory home">
          <span className="brand-mark">{"</>"}</span>
          <span>
            Dev<span className="brand-accent">Directory</span>
          </span>
        </a>

        <nav>
          <a className="nav-active" href="#home">
            ⌂ <span>Home</span>
          </a>
          <a href="#developers">
            ♧ <span>Developers</span>
          </a>
          <a href="#about">
            ⓘ <span>About</span>
          </a>
        </nav>

        <div className="nav-right">
          <span className="api-indicator">
            <i
              className={
                apiStatus === "online" || apiStatus === "cached"
                  ? "online"
                  : ""
              }
            />

            {apiStatus === "online"
              ? "GitHub connected"
              : apiStatus === "cached"
                ? "Cached profiles"
                : apiStatus === "offline"
                  ? "API offline"
                  : "Connecting GitHub"}
          </span>

          <span className="country-pill">🇮🇳 India</span>
        </div>
      </header>

      <main id="home">
        <section className="hero">
          <div className="eyebrow">
            <span />
            THE INDIAN DEVELOPER NETWORK
          </div>

          <h1>
            Find your next <span>developer.</span>
          </h1>

          <p className="hero-copy">
            Discover public GitHub profiles, explore developers, and connect
            with people across India.
          </p>

          <label className="search-box">
            <Icon>⌕</Icon>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, username, bio, skills or repo..."
              aria-label="Search developers"
            />

            {search && (
              <button
                className="clear-search"
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}

            <kbd>⌘ K</kbd>
          </label>

          <div className="filter-row">
            <label className="filter-control">
              <span>
                ⌖ <small>LOCATION</small>
              </span>

              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              >
                <option>All locations</option>

                {allLocations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-control">
              <span>
                ⌘ <small>LANGUAGE</small>
              </span>

              <select
                value={skill}
                onChange={(event) => setSkill(event.target.value)}
              >
                <option>All skills</option>

                {allSkills.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-control">
              <span>
                ▣ <small>PUBLIC REPOS</small>
              </span>

              <select
                value={repoRange}
                onChange={(event) => setRepoRange(event.target.value)}
              >
                <option>Any repo count</option>
                <option>0–10 repos</option>
                <option>11–50 repos</option>
                <option>51+ repos</option>
              </select>
            </label>

            <label className="filter-control">
              <span>
                ↕ <small>SORT BY</small>
              </span>

              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option>Name (A–Z)</option>
                <option>Name (Z–A)</option>
                <option>Most followers</option>
                <option>Most repositories</option>
              </select>
            </label>
          </div>
        </section>

        <section className="directory" id="developers">
          <div className="section-heading">
            <div>
              <p className="section-kicker">LIVE GITHUB PROFILES</p>
              <h2>
                Meet the developers <span>↘</span>
              </h2>
            </div>

            <div className="result-count">
              <span className="count-number">
                {filtered.length.toString().padStart(2, "0")}
              </span>

              <span>developers found</span>

              <button type="button" onClick={clearFilters}>
                Reset filters ↺
              </button>
            </div>
          </div>

          {apiStatus === "loading" && developers.length === 0 ? (
            <div className="empty-state">
              <h3>Loading GitHub developers...</h3>
              <p>Fetching public profiles and repositories.</p>
            </div>
          ) : error && developers.length === 0 ? (
            <div className="empty-state">
              <h3>Could not load GitHub profiles</h3>
              <p>{error}</p>

              <button type="button" onClick={retryFetch}>
                Try again
              </button>
            </div>
          ) : filtered.length > 0 ? (
            <div className="developer-grid">
              {filtered.map((person) => (
                <DeveloperCard key={person.id} person={person} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div>⌕</div>
              <h3>No developers found</h3>
              <p>Try another search term or change your filters.</p>

              <button type="button" onClick={clearFilters}>
                Clear all filters
              </button>
            </div>
          )}

          {error && developers.length > 0 && (
            <div className="empty-state">
              <p>{error}</p>
              <button type="button" onClick={loadMoreDevelopers}>
                Try loading again
              </button>
            </div>
          )}

          {developers.length > 0 && hasMore && (
            <div className="empty-state">
              <button
                type="button"
                onClick={loadMoreDevelopers}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading developers..." : "Load More Developers"}
              </button>
            </div>
          )}

          {!hasMore && developers.length > 0 && (
            <div className="empty-state">
              <p>No more profiles found for this search.</p>
            </div>
          )}
        </section>
      </main>

      <footer id="about">
        <a className="brand footer-brand" href="#home">
          <span className="brand-mark">{"</>"}</span>
          <span>
            Dev<span className="brand-accent">Directory</span>
          </span>
        </a>

        <p>
          Built with curiosity <span>✦</span> Made in India 🇮🇳
        </p>

        <a className="back-top" href="#home">
          Back to top ↑
        </a>
      </footer>

      <div className="disclaimer">
        Data is provided by the GitHub public API. Only publicly available
        profile and repository details can be displayed. Some fields may be
        empty when a user has not made them public.
      </div>
    </div>
  );
}