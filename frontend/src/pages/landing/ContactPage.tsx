import React from 'react';
import { Mail, MapPin, ExternalLink } from 'lucide-react';

const collegeLocationUrl = 'https://www.bing.com/maps/default.aspx?v=2&pc=FACEBK&mid=8100&where1=13.14609%2C%20123.72267&FORM=FBKPL1&name=Bicol%20University%20College%20of%20Dental%20Medicine%2C%20Daraga%2C%20Philippines%2C%204501&mkt=en-US&fbclid=IwZXh0bgNhZW0CMTAAcGRvZgVzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEfwa7FIz845PmqlGJFX9wHJxHlhtW7KYWYBl6tvW84wq1jNvsDUsTMj_rZkpE_aem_tBqDFEEF2kyGmXqvHp4baA';
const collegeFacebookUrl = 'https://www.facebook.com/profile.php?id=100095192060628';

export function ContactPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-10 lg:px-16">
      <div className="mx-auto grid w-full max-w-7xl items-start gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="flex min-w-0 flex-col items-start text-left lg:col-span-5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl md:text-4xl font-heading leading-tight">
            Connect with the{' '}
            <span className="text-purple-600">College of Dental Medicine</span>
          </h1>
          <p className="mt-3 text-xs leading-relaxed text-slate-600 sm:text-sm">
            Contact the College through its email, visit its Daraga location, or connect on its Facebook page.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-7">
          <a
            href="mailto:bu-dmd@bicol-u.edu.ph"
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-purple-200"
          >
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 font-heading">Email</h2>
              <span className="mt-0.5 inline-block break-all text-xs font-medium text-purple-600 hover:underline">
                bu-dmd@bicol-u.edu.ph
              </span>
            </div>
            <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </a>

          <a
            href={collegeLocationUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-purple-200"
          >
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 font-heading">Location</h2>
              <span className="mt-0.5 inline-block text-xs font-medium text-slate-600">
                Bicol University College of Dental Medicine, Daraga, Philippines, 4501
              </span>
            </div>
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </a>

          <a
            href={collegeFacebookUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-purple-200"
          >
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 font-heading">Facebook</h2>
              <span className="mt-0.5 inline-block break-all text-xs font-medium text-purple-600 hover:underline">
                Bicol University College of Dental Medicine
              </span>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </a>
        </div>
      </div>
    </main>
  );
}
