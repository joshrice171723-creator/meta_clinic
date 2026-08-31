import { ArrowDown, ArrowUpRight, Check, ClipboardList, FolderCheck, HeartHandshake, MapPin, Plus, Workflow } from 'lucide-react';
import { Faq } from '@/components/faq';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

const steps = ['Your clinic, defined', 'Your launch, coordinated', 'Your systems, set up', 'Your first patient, next'];
const services = [
  { icon: ClipboardList, number: '01', title: 'A plan you can act on.', description: 'A clinic-specific launch plan and organized packet, informed by the work of setting up a real Texas practice.', items: ['Launch checklist & information gathering', 'Paperwork coordination', 'Clear responsibilities & next steps'] },
  { icon: MapPin, number: '02', title: 'The moving parts, managed.', description: 'Hands-on coordination across the setup process, with the right questions brought to the right people.', items: ['Local setup & permitting coordination', 'Professional-adviser coordination', 'Opening-readiness planning'] },
  { icon: Workflow, number: '03', title: 'Systems with a purpose.', description: 'Practical tools and workflows designed around the everyday work of a small cash-pay clinic.', items: ['Starter SharePoint patient-record setup', 'Administrative workflow organization', 'Team onboarding & handoff'] },
  { icon: HeartHandshake, number: '04', title: 'Support beyond a checklist.', description: 'A launch relationship built to continue, with ongoing support and physician mentorship in development.', items: ['Launch questions & issue tracking', 'Ongoing support planning', 'Physician-informed guidance'] },
];
const process = [
  ['Shape the clinic.', 'We start with your services, location, and goals, then define a realistic scope of work together.'],
  ['Coordinate the launch.', 'We organize the packet and setup tasks, working with you and the relevant professional advisers.'],
  ['Put systems in place.', 'We help configure the operational tools and workflows your team will use day to day.'],
  ['Prepare to open.', 'We review outstanding items, hand off your setup, and agree on the support you need next.'],
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" /> BUILT FOR NPs &amp; PAs. ROOTED IN NORTH TEXAS.</p>
            <h1 id="hero-title">Your own clinic.<br /><em>A little less<br />on your shoulders.</em></h1>
            <p className="hero-description">You bring the vision for better care. We help handle the steps to opening your cash-pay clinic—from the launch paperwork to the systems behind your first patient.</p>
            <a className="primary-link" href="/contact">Let’s talk about your clinic <ArrowUpRight aria-hidden="true" size={19} /></a>
            <p className="hero-note">Physician-informed experience. Hands-on execution. One clear path.</p>
          </div>
          <div className="launch-panel" aria-label="Overview of the clinic launch process">
            <div className="panel-topline"><span>THE APPly APPROACH</span><Plus aria-hidden="true" size={20} /></div>
            <h2>From an idea<br />to <em>open doors.</em></h2>
            <div className="launch-steps">
              {steps.map((step, i) => <div className="launch-step" key={step}><span className="step-number">0{i + 1}</span><span>{step}</span><ArrowUpRight aria-hidden="true" size={17} /></div>)}
            </div>
            <div className="panel-bottom"><span className="panel-symbol"><Check aria-hidden="true" size={18} /></span><p>More support behind the scenes.<br /><strong>More room to focus on care.</strong></p></div>
          </div>
          <a href="#approach" className="scroll-cue"><ArrowDown aria-hidden="true" size={16} /> A NEW WAY TO GET STARTED</a>
        </section>

        <section className="intro-section wrap" id="approach" aria-labelledby="approach-title">
          <div className="section-heading">
            <div><p className="eyebrow">YOUR EXPERTISE. YOUR PRACTICE.</p><h2 id="approach-title">Built around the provider.<br /><em>Not the paperwork.</em></h2></div>
            <p>APPly is a done-for-you clinic-launch consultancy for nurse practitioners and physician assistants in Sherman and North Texas. We turn the moving parts into a coordinated plan—and help put that plan into motion.</p>
          </div>
          <div className="services-grid">
            {services.map(({ icon: Icon, number, title, description, items }) => (
              <article className="service-card" key={number}>
                <div className="service-top"><Icon aria-hidden="true" size={24} strokeWidth={1.4} /><span>{number}</span></div>
                <h3>{title}</h3><p>{description}</p>
                <ul>{items.map((item) => <li key={item}><Check aria-hidden="true" size={13} />{item}</li>)}</ul>
              </article>
            ))}
          </div>
          <p className="scope-note">Your clinic is specific. So is your engagement. Services, professional arrangements, and ongoing support are scoped before work begins.</p>
        </section>

        <section className="process-section" id="process" aria-labelledby="process-title">
          <div className="wrap">
            <div className="section-heading">
              <div><p className="eyebrow">LESS GUESSWORK. MORE FORWARD MOTION.</p><h2 id="process-title">A clear path.<br /><em>A hands-on partner.</em></h2></div>
              <p>We do the coordination and execution. You stay involved where it matters: your vision, your decisions, and the responsibilities only you can own.</p>
            </div>
            <ol className="process-grid">{process.map(([title, description], i) => (
              <li key={title}><span className="process-number">0{i + 1}</span><h3>{title}</h3><p>{description}</p></li>
            ))}</ol>
            <a className="text-link" href="/contact">Talk through your next step <ArrowUpRight aria-hidden="true" size={17} /></a>
          </div>
        </section>

        <section className="experience-section wrap" aria-labelledby="experience-title">
          <div className="experience-label"><FolderCheck aria-hidden="true" size={32} strokeWidth={1.2} /><p className="eyebrow">EXPERIENCE, NOT JUST A FRAMEWORK</p><span>Sherman, Texas</span></div>
          <div>
            <h2 id="experience-title">Built with someone<br />who’s <em>opened the doors.</em></h2>
            <p>Co-founder Kevin Stacks, MD, brings firsthand experience setting up a cash-pay clinic in Texas. His documented launch process is the starting point for the APPly packet and a more supported path for the next provider.</p>
            <p className="experience-detail">That experience informs the work. Your clinic still gets its own plan, professional review, and implementation.</p>
            <a className="text-link" href="https://stacksadultmedicine.com/" target="_blank" rel="noopener noreferrer">Meet the practice behind the experience <ArrowUpRight aria-hidden="true" size={17} /><span className="sr-only"> (opens in a new tab)</span></a>
          </div>
        </section>

        <section className="faq-section wrap" id="questions" aria-labelledby="questions-title">
          <div><p className="eyebrow">A FEW THINGS YOU MAY BE WONDERING</p><h2 id="questions-title">Good questions.<br /><em>Clear answers.</em></h2></div>
          <Faq />
        </section>

        <section className="contact-cta" aria-labelledby="contact-cta-title">
          <div className="wrap contact-cta-inner">
            <div>
              <p className="eyebrow">MAKE ROOM FOR WHAT’S NEXT</p>
              <h2 id="contact-cta-title">Your clinic starts<br />with <em>a conversation.</em></h2>
              <p>Tell us where you want to go. We’ll talk through the next step together.</p>
            </div>
            <a className="primary-link" href="/contact">Get in touch <ArrowUpRight aria-hidden="true" size={19} /></a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
