import { Link } from 'react-router-dom';
import { BrandWordmarkInner } from '../components/BrandWordmark';
import { ThemePicker } from '../components/ThemePicker';
import { CONTACT_EMAIL } from './legalConstants';
import './legal.css';

const LAST_UPDATED = 'May 09, 2026';

export default function PrivacyPage() {
  return (
    <div className="legal-shell">
      <a href="#main" className="legal-skip-link">Skip to content</a>
      <header className="legal-nav">
        <Link to="/" className="legal-nav-home" aria-label="Back to plinths">
          <BrandWordmarkInner variant="header" />
        </Link>
        <ThemePicker />
      </header>

      <main id="main" tabIndex={-1} className="legal-main">
        <article className="legal-article">
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-subtitle">Last updated {LAST_UPDATED}</p>

          <p className="legal-lede">
            This Privacy Notice for <strong>Plinths</strong> ("we," "us," or "our") describes
            how and why we might access, collect, store, use, and/or share ("process") your
            personal information when you use our services ("Services"), including when you:
          </p>

          <ul>
            <li>
              Visit our website at{' '}
              <a href="https://plinths.net/" target="_blank" rel="noopener noreferrer">
                https://plinths.net
              </a>{' '}
              or any website of ours that links to this Privacy Notice.
            </li>
            <li>
              Use Plinths. Plinths is an AI-powered market intelligence product. Users
              describe a business idea in plain language and get a structured brief:
              competitive landscape, saturation signals, difficulty / opportunity scores,
              market framing, and a practical entry roadmap, plus supporting detail
              (e.g. competitors with strengths and weaknesses, gaps, phases, headline stats).
            </li>
            <li>Engage with us in other related ways, including any marketing or events.</li>
          </ul>

          <p>
            <strong>Questions or concerns?</strong> Reading this Privacy Notice will help
            you understand your privacy rights and choices. We are responsible for making
            decisions about how your personal information is processed. If you do not agree
            with our policies and practices, please do not use our Services. If you still
            have any questions or concerns, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <section className="legal-summary" aria-label="Summary of key points">
            <p className="legal-summary-title">Summary of key points</p>
            <p>
              <strong>What personal information do we process?</strong> When you visit, use,
              or navigate our Services, we may process personal information depending on
              how you interact with us, the choices you make, and the products and features
              you use. See <a href="#infocollect">What information do we collect?</a>
            </p>
            <p>
              <strong>Do we process any sensitive personal information?</strong> We do not
              process sensitive personal information.
            </p>
            <p>
              <strong>Do we collect any information from third parties?</strong> We do not
              collect any information from third parties.
            </p>
            <p>
              <strong>How do we process your information?</strong> We process your
              information to provide, improve, and administer our Services, communicate
              with you, for security and fraud prevention, and to comply with law. We
              process your information only when we have a valid legal reason to do so.
              See <a href="#infouse">How do we process your information?</a>
            </p>
            <p>
              <strong>In what situations and with which parties do we share personal information?</strong>{' '}
              We may share information in specific situations and with specific third
              parties. See <a href="#whoshare">When and with whom do we share your personal information?</a>
            </p>
            <p>
              <strong>How do we keep your information safe?</strong> We have organisational
              and technical processes in place to protect your personal information.
              No electronic transmission or storage technology is 100% secure, so we
              cannot guarantee that unauthorised parties will not be able to defeat our
              security and improperly collect, access, steal, or modify your information.
              See <a href="#infosafe">How do we keep your information safe?</a>
            </p>
            <p>
              <strong>What are your rights?</strong> Depending on where you are located,
              applicable privacy law may give you certain rights regarding your personal
              information. See <a href="#privacyrights">What are your privacy rights?</a>
            </p>
            <p>
              <strong>How do you exercise your rights?</strong> The easiest way is by
              contacting us, or by{' '}
              <a
                href="https://app.termly.io/dsar/815d1b81-bf38-4ebe-906f-21f2e5a3add0"
                target="_blank"
                rel="noopener noreferrer"
              >
                submitting a data subject access request
              </a>
              . We will consider and act upon any request in accordance with applicable
              data protection laws.
            </p>
          </section>

          <nav className="legal-toc" aria-label="Table of contents">
            <p className="legal-toc-title">Contents</p>
            <ol className="legal-toc-list">
              <li><a href="#infocollect"><span className="legal-toc-num">01</span>What information do we collect?</a></li>
              <li><a href="#infouse"><span className="legal-toc-num">02</span>How do we process your information?</a></li>
              <li><a href="#legalbases"><span className="legal-toc-num">03</span>What legal bases do we rely on to process your personal information?</a></li>
              <li><a href="#whoshare"><span className="legal-toc-num">04</span>When and with whom do we share your personal information?</a></li>
              <li><a href="#ai"><span className="legal-toc-num">05</span>Do we offer artificial-intelligence-based products?</a></li>
              <li><a href="#sociallogins"><span className="legal-toc-num">06</span>How do we handle your social logins?</a></li>
              <li><a href="#inforetain"><span className="legal-toc-num">07</span>How long do we keep your information?</a></li>
              <li><a href="#infosafe"><span className="legal-toc-num">08</span>How do we keep your information safe?</a></li>
              <li><a href="#infominors"><span className="legal-toc-num">09</span>Do we collect information from minors?</a></li>
              <li><a href="#privacyrights"><span className="legal-toc-num">10</span>What are your privacy rights?</a></li>
              <li><a href="#DNT"><span className="legal-toc-num">11</span>Controls for do-not-track features</a></li>
              <li><a href="#uslaws"><span className="legal-toc-num">12</span>Do United States residents have specific privacy rights?</a></li>
              <li><a href="#policyupdates"><span className="legal-toc-num">13</span>Do we make updates to this notice?</a></li>
              <li><a href="#contact"><span className="legal-toc-num">14</span>How can you contact us about this notice?</a></li>
              <li><a href="#request"><span className="legal-toc-num">15</span>How can you review, update, or delete the data we collect?</a></li>
            </ol>
          </nav>

          <section id="infocollect">
            <h2>1. What information do we collect?</h2>

            <h3>Personal information you disclose to us</h3>
            <p className="legal-callout">
              <strong>In short:</strong> <em>We collect personal information that you provide to us.</em>
            </p>
            <p>
              We collect personal information that you voluntarily provide to us when you
              register on the Services, express an interest in obtaining information about
              us or our products and Services, when you participate in activities on the
              Services, or otherwise when you contact us.
            </p>
            <p>
              <strong>Personal information provided by you.</strong> The personal information
              we collect depends on the context of your interactions with us and the
              Services, the choices you make, and the products and features you use. The
              personal information we collect may include:
            </p>
            <ul>
              <li>Names</li>
              <li>Email addresses</li>
            </ul>

            <p id="sensitiveinfo">
              <strong>Sensitive information.</strong> We do not process sensitive information.
            </p>

            <p>
              <strong>Payment data.</strong> We may collect data necessary to process your
              payment if you choose to make purchases, such as your payment-instrument
              number and the security code associated with it. All payment data is handled
              and stored by Stripe. You may find their privacy notice at{' '}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
                https://stripe.com/privacy
              </a>
              .
            </p>

            <p>
              <strong>Social-media login data.</strong> We may provide you with the option
              to register with us using your existing social-media account details, like
              your Facebook, X, or other social-media account. If you choose to register in
              this way, we will collect certain profile information from the social-media
              provider, as described in{' '}
              <a href="#sociallogins">How do we handle your social logins?</a> below.
            </p>

            <p>
              All personal information that you provide to us must be true, complete, and
              accurate, and you must notify us of any changes to such personal information.
            </p>

            <h3>Google API</h3>
            <p>
              Our use of information received from Google APIs will adhere to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy#limited-use"
                target="_blank"
                rel="noopener noreferrer"
              >
                Limited Use requirements
              </a>
              .
            </p>
          </section>

          <section id="infouse">
            <h2>2. How do we process your information?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>
                We process your information to provide, improve, and administer our
                Services, communicate with you, for security and fraud prevention, and to
                comply with law. We may also process your information for other purposes
                with your consent.
              </em>
            </p>
            <p>
              <strong>We process your personal information for a variety of reasons,
              depending on how you interact with our Services, including:</strong>
            </p>
            <ul>
              <li>
                <strong>To facilitate account creation and authentication and otherwise manage user accounts.</strong>{' '}
                We may process your information so you can create and log in to your
                account, and to keep your account in working order.
              </li>
              <li>
                <strong>To save or protect an individual's vital interest.</strong>{' '}
                We may process your information when necessary to save or protect an
                individual's vital interest, such as to prevent harm.
              </li>
            </ul>
          </section>

          <section id="legalbases">
            <h2>3. What legal bases do we rely on to process your information?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>
                We only process your personal information when we believe it is necessary
                and we have a valid legal reason to do so under applicable law, like with
                your consent, to comply with laws, to provide you with services, to fulfil
                our contractual obligations, to protect your rights, or to fulfil our
                legitimate business interests.
              </em>
            </p>

            <h3>If you are located in the EU or UK, this section applies to you.</h3>
            <p>
              The General Data Protection Regulation (GDPR) and UK GDPR require us to
              explain the valid legal bases we rely on in order to process your personal
              information. We may rely on the following legal bases:
            </p>
            <ul>
              <li>
                <strong>Consent.</strong> We may process your information if you have given
                us permission to use your personal information for a specific purpose. You
                can withdraw your consent at any time.
              </li>
              <li>
                <strong>Legal obligations.</strong> We may process your information where
                we believe it is necessary for compliance with our legal obligations, such
                as to cooperate with a law-enforcement body or regulatory agency, exercise
                or defend our legal rights, or disclose your information as evidence in
                litigation.
              </li>
              <li>
                <strong>Vital interests.</strong> We may process your information where we
                believe it is necessary to protect your vital interests or the vital
                interests of a third party, such as situations involving potential threats
                to the safety of any person.
              </li>
            </ul>

            <h3>If you are located in Canada, this section applies to you.</h3>
            <p>
              We may process your information if you have given us specific permission
              (express consent), or in situations where your permission can be inferred
              (implied consent). You can withdraw your consent at any time.
            </p>
            <p>
              In some exceptional cases, we may be legally permitted under applicable law
              to process your information without your consent, including:
            </p>
            <ul>
              <li>If collection is clearly in the interests of an individual and consent cannot be obtained in a timely way.</li>
              <li>For investigations and fraud detection and prevention.</li>
              <li>For business transactions provided certain conditions are met.</li>
              <li>If it is contained in a witness statement and the collection is necessary to assess, process, or settle an insurance claim.</li>
              <li>For identifying injured, ill, or deceased persons and communicating with next of kin.</li>
              <li>If we have reasonable grounds to believe an individual has been, is, or may be victim of financial abuse.</li>
              <li>If it is reasonable to expect that collection and use with consent would compromise the availability or accuracy of the information, and the collection is reasonable for purposes related to investigating a breach of an agreement or a contravention of the laws of Canada or a province.</li>
              <li>If disclosure is required to comply with a subpoena, warrant, court order, or rules of the court relating to the production of records.</li>
              <li>If it was produced by an individual in the course of their employment, business, or profession and the collection is consistent with the purposes for which the information was produced.</li>
              <li>If the collection is solely for journalistic, artistic, or literary purposes.</li>
              <li>If the information is publicly available and is specified by the regulations.</li>
            </ul>
          </section>

          <section id="whoshare">
            <h2>4. When and with whom do we share your personal information?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>We may share information in specific situations described in this section.</em>
            </p>
            <p>We may need to share your personal information in the following situations:</p>
            <ul>
              <li>
                <strong>Business transfers.</strong> We may share or transfer your
                information in connection with, or during negotiations of, any merger,
                sale of company assets, financing, or acquisition of all or a portion of
                our business to another company.
              </li>
              <li>
                <strong>Service providers.</strong> We may share your information with
                third-party vendors, service providers, contractors, or agents who perform
                services for us or on our behalf and require access to such information to
                do that work, for example payment processing (Stripe), authentication
                (Amazon Cognito), and the AI service providers listed in{' '}
                <a href="#ai">Do we offer AI-based products?</a> below.
              </li>
            </ul>
          </section>

          <section id="ai">
            <h2>5. Do we offer artificial-intelligence-based products?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>
                We offer products, features, or tools powered by artificial intelligence,
                machine learning, or similar technologies.
              </em>
            </p>
            <p>
              As part of our Services, we offer products, features, or tools powered by
              artificial intelligence, machine learning, or similar technologies
              (collectively, "AI Products"). These tools are designed to enhance your
              experience and provide you with the structured market briefs that Plinths
              produces. The terms in this Privacy Notice govern your use of the AI
              Products within our Services.
            </p>

            <h3>Use of AI technologies</h3>
            <p>
              We provide the AI Products through third-party service providers ("AI Service
              Providers"), including Amazon Bedrock, Anthropic, DeepSeek, Amazon Web
              Services (AWS) AI, OpenAI, and Perplexity. As outlined in this Privacy
              Notice, your input, output, and personal information will be shared with and
              processed by these AI Service Providers to enable your use of our AI Products
              for purposes outlined in{' '}
              <a href="#legalbases">What legal bases do we rely on to process your personal information?</a>{' '}
              You must not use the AI Products in any way that violates the terms or
              policies of any AI Service Provider.
            </p>

            <h3>How we process your data using AI</h3>
            <p>
              All personal information processed using our AI Products is handled in line
              with this Privacy Notice and our agreements with third parties. This is
              designed to safeguard your personal information throughout the process.
            </p>
          </section>

          <section id="sociallogins">
            <h2>6. How do we handle your social logins?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>
                If you choose to register or log in to our Services using a social-media
                account, we may have access to certain information about you.
              </em>
            </p>
            <p>
              Our Services offer you the ability to register and log in using your
              third-party social-media account details (like your Google, Facebook, or X
              logins). Where you choose to do this, we will receive certain profile
              information about you from your social-media provider. The profile
              information we receive may vary depending on the provider, but will often
              include your name, email address, friends list, and profile picture, as well
              as other information you choose to make public.
            </p>
            <p>
              We will use the information we receive only for the purposes described in
              this Privacy Notice or that are otherwise made clear to you on the relevant
              Services. We do not control, and are not responsible for, other uses of your
              personal information by your third-party social-media provider. We recommend
              that you review their privacy notice to understand how they collect, use,
              and share your personal information.
            </p>
          </section>

          <section id="inforetain">
            <h2>7. How long do we keep your information?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>
                We keep your information for as long as necessary to fulfil the purposes
                outlined in this Privacy Notice unless otherwise required by law.
              </em>
            </p>
            <p>
              We will only keep your personal information for as long as it is necessary
              for the purposes set out in this Privacy Notice, unless a longer retention
              period is required or permitted by law (such as tax, accounting, or other
              legal requirements). No purpose in this notice will require us to keep your
              personal information for longer than the period of time in which you have an
              account with us.
            </p>
            <p>
              When we have no ongoing legitimate business need to process your personal
              information, we will either delete or anonymise such information, or, if
              this is not possible (for example, because your personal information has
              been stored in backup archives), then we will securely store your personal
              information and isolate it from any further processing until deletion is
              possible.
            </p>
          </section>

          <section id="infosafe">
            <h2>8. How do we keep your information safe?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>
                We aim to protect your personal information through a system of
                organisational and technical security measures.
              </em>
            </p>
            <p>
              We have implemented appropriate and reasonable technical and organisational
              security measures designed to protect the security of any personal
              information we process. However, despite our safeguards and efforts to
              secure your information, no electronic transmission over the Internet or
              information-storage technology can be guaranteed to be 100% secure, so we
              cannot promise or guarantee that hackers, cybercriminals, or other
              unauthorised third parties will not be able to defeat our security and
              improperly collect, access, steal, or modify your information. Although we
              will do our best to protect your personal information, transmission of
              personal information to and from our Services is at your own risk. You
              should only access the Services within a secure environment.
            </p>
          </section>

          <section id="infominors">
            <h2>9. Do we collect information from minors?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>
                We do not knowingly collect data from or market to children under 18 years
                of age, or the equivalent age as specified by law in your jurisdiction.
              </em>
            </p>
            <p>
              We do not knowingly collect, solicit data from, or market to children under
              18 years of age, nor do we knowingly sell such personal information. By
              using the Services, you represent that you are at least 18, or that you are
              the parent or guardian of such a minor and consent to the minor dependent's
              use of the Services. If we learn that personal information from users less
              than 18 years of age has been collected, we will deactivate the account and
              take reasonable measures to promptly delete such data from our records. If
              you become aware of any data we may have collected from children under
              age 18, please contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section id="privacyrights">
            <h2>10. What are your privacy rights?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>
                Depending on your state of residence in the US, or in some regions such
                as the European Economic Area (EEA), United Kingdom (UK), Switzerland, and
                Canada, you have rights that allow you greater access to and control over
                your personal information. You may review, change, or terminate your
                account at any time, depending on your country, province, or state of
                residence.
              </em>
            </p>
            <p>
              In some regions (like the EEA, UK, Switzerland, and Canada), you have
              certain rights under applicable data protection laws. These may include the
              right (i) to request access and obtain a copy of your personal information,
              (ii) to request rectification or erasure, (iii) to restrict the processing
              of your personal information, (iv) if applicable, to data portability, and
              (v) not to be subject to automated decision-making. If a decision that
              produces legal or similarly significant effects is made solely by automated
              means, we will inform you, explain the main factors, and offer a simple way
              to request human review. In certain circumstances, you may also have the
              right to object to the processing of your personal information. You can
              make such a request by contacting us using the contact details in{' '}
              <a href="#contact">How can you contact us about this notice?</a> below.
            </p>
            <p>We will consider and act upon any request in accordance with applicable data protection laws.</p>
            <p>
              If you are located in the EEA or UK and believe we are unlawfully processing
              your personal information, you also have the right to complain to your{' '}
              <a
                href="https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm"
                target="_blank"
                rel="noopener noreferrer"
              >
                Member State data protection authority
              </a>{' '}
              or{' '}
              <a
                href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/"
                target="_blank"
                rel="noopener noreferrer"
              >
                UK data protection authority
              </a>
              .
            </p>
            <p>
              If you are located in Switzerland, you may contact the{' '}
              <a
                href="https://www.edoeb.admin.ch/edoeb/en/home.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                Federal Data Protection and Information Commissioner
              </a>
              .
            </p>

            <h3 id="withdrawconsent">Withdrawing your consent</h3>
            <p>
              If we are relying on your consent to process your personal information,
              which may be express and/or implied consent depending on the applicable law,
              you have the right to withdraw your consent at any time. You can withdraw
              your consent at any time by contacting us using the details in{' '}
              <a href="#contact">How can you contact us about this notice?</a> below or
              by updating your preferences. However, this will not affect the lawfulness
              of the processing before its withdrawal nor, when applicable law allows,
              will it affect the processing of your personal information conducted in
              reliance on lawful processing grounds other than consent.
            </p>

            <h3>Opting out of marketing and promotional communications</h3>
            <p>
              You can unsubscribe from our marketing and promotional communications at any
              time by clicking on the unsubscribe link in the emails we send, or by
              contacting us using the details in{' '}
              <a href="#contact">How can you contact us about this notice?</a> below. You
              will then be removed from the marketing lists. However, we may still
              communicate with you. For example, to send you service-related messages
              that are necessary for the administration and use of your account, to
              respond to service requests, or for other non-marketing purposes.
            </p>

            <h3>Account information</h3>
            <p>
              If you would at any time like to review or change the information in your
              account or terminate your account, you can log in to your account settings
              and update your user account.
            </p>
            <p>
              Upon your request to terminate your account, we will deactivate or delete
              your account and information from our active databases. However, we may
              retain some information in our files to prevent fraud, troubleshoot
              problems, assist with any investigations, enforce our legal terms, and/or
              comply with applicable legal requirements.
            </p>
            <p>
              If you have questions or comments about your privacy rights, you may email
              us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section id="DNT">
            <h2>11. Controls for do-not-track features</h2>
            <p>
              Most web browsers and some mobile operating systems and mobile applications
              include a do-not-track ("DNT") feature or setting you can activate to signal
              your privacy preference not to have data about your online browsing
              activities monitored and collected. At this stage, no uniform technology
              standard for recognising and implementing DNT signals has been finalised.
              As such, we do not currently respond to DNT browser signals or any other
              mechanism that automatically communicates your choice not to be tracked
              online. If a standard for online tracking is adopted that we must follow in
              the future, we will inform you about that practice in a revised version of
              this Privacy Notice.
            </p>
            <p>
              California law requires us to let you know how we respond to web browser DNT
              signals. Because there currently is not an industry or legal standard for
              recognising or honouring DNT signals, we do not respond to them at this time.
            </p>
          </section>

          <section id="uslaws">
            <h2>12. Do United States residents have specific privacy rights?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>
                If you are a resident of California, Colorado, Connecticut, Delaware,
                Florida, Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana, Nebraska,
                New Hampshire, New Jersey, Oregon, Rhode Island, Tennessee, Texas, Utah,
                or Virginia, you may have the right to request access to and receive
                details about the personal information we maintain about you and how we
                have processed it, correct inaccuracies, get a copy of, or delete your
                personal information.
              </em>
            </p>

            <h3>Categories of personal information we collect</h3>
            <p>
              The table below shows the categories of personal information we have
              collected in the past twelve (12) months. The table includes illustrative
              examples of each category and does not reflect the personal information we
              collect from you. For a comprehensive inventory of all personal information
              we process, please refer to{' '}
              <a href="#infocollect">What information do we collect?</a>
            </p>

            <div className="legal-table-wrap">
              <table className="legal-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Examples</th>
                    <th>Collected</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>A. Identifiers</td>
                    <td>Contact details such as real name, alias, postal address, telephone or mobile contact number, unique personal identifier, online identifier, IP address, email address, and account name</td>
                    <td>Yes</td>
                  </tr>
                  <tr>
                    <td>B. Personal information as defined in the California Customer Records statute</td>
                    <td>Name, contact information, education, employment, employment history, and financial information</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>C. Protected classification characteristics under state or federal law</td>
                    <td>Gender, age, date of birth, race and ethnicity, national origin, marital status, and other demographic data</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>D. Commercial information</td>
                    <td>Transaction information, purchase history, financial details, and payment information</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>E. Biometric information</td>
                    <td>Fingerprints and voiceprints</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>F. Internet or other similar network activity</td>
                    <td>Browsing history, search history, online behaviour, interest data, and interactions with our and other websites, applications, systems, and advertisements</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>G. Geolocation data</td>
                    <td>Device location</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>H. Audio, electronic, sensory, or similar information</td>
                    <td>Images and audio, video, or call recordings created in connection with our business activities</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>I. Professional or employment-related information</td>
                    <td>Business contact details to provide you our Services at a business level, or job title, work history, and professional qualifications if you apply for a job with us</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>J. Education information</td>
                    <td>Student records and directory information</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>K. Inferences drawn from collected personal information</td>
                    <td>Inferences drawn from any of the collected personal information listed above to create a profile or summary about, for example, an individual's preferences and characteristics</td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>L. Sensitive personal information</td>
                    <td>—</td>
                    <td>No</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p>
              We may also collect other personal information outside of these categories
              through instances where you interact with us in person, online, or by phone
              or mail in the context of:
            </p>
            <ul>
              <li>Receiving help through our customer support channels.</li>
              <li>Participation in customer surveys or contests.</li>
              <li>Facilitation in the delivery of our Services and to respond to your inquiries.</li>
            </ul>
            <p>We will use and retain the collected personal information as needed to provide the Services or for:</p>
            <ul>
              <li>Category A: As long as the user has an account with us.</li>
            </ul>

            <h3>Sources of personal information</h3>
            <p>
              Learn more about the sources of personal information we collect in{' '}
              <a href="#infocollect">What information do we collect?</a>
            </p>

            <h3>How we use and share personal information</h3>
            <p>
              Learn more about how we use your personal information in{' '}
              <a href="#infouse">How do we process your information?</a>
            </p>

            <p>
              <strong>Will your information be shared with anyone else?</strong> We may
              disclose your personal information with our service providers pursuant to a
              written contract between us and each service provider. Learn more about how
              we disclose personal information in{' '}
              <a href="#whoshare">When and with whom do we share your personal information?</a>
            </p>
            <p>
              We may use your personal information for our own business purposes, such as
              for undertaking internal research for technological development and
              demonstration. This is not considered to be "selling" of your personal
              information.
            </p>
            <p>
              We have not disclosed, sold, or shared any personal information to third
              parties for a business or commercial purpose in the preceding twelve (12)
              months. We will not sell or share personal information in the future
              belonging to website visitors, users, and other consumers.
            </p>

            <h3>Your rights</h3>
            <p>
              You have rights under certain US state data-protection laws. However, these
              rights are not absolute, and in certain cases, we may decline your request
              as permitted by law. These rights include:
            </p>
            <ul>
              <li><strong>Right to know</strong> whether or not we are processing your personal data.</li>
              <li><strong>Right to access</strong> your personal data.</li>
              <li><strong>Right to correct</strong> inaccuracies in your personal data.</li>
              <li><strong>Right to request</strong> the deletion of your personal data.</li>
              <li><strong>Right to obtain a copy</strong> of the personal data you previously shared with us.</li>
              <li><strong>Right to non-discrimination</strong> for exercising your rights.</li>
              <li>
                <strong>Right to opt out</strong> of the processing of your personal data
                if it is used for targeted advertising (or sharing as defined under
                California's privacy law), the sale of personal data, or profiling in
                furtherance of decisions that produce legal or similarly significant
                effects ("profiling").
              </li>
            </ul>
            <p>Depending upon the state where you live, you may also have the following rights:</p>
            <ul>
              <li>Right to access the categories of personal data being processed (as permitted by applicable law, including the privacy law in Minnesota).</li>
              <li>Right to obtain a list of the categories of third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in California, Delaware, and Maryland).</li>
              <li>Right to obtain a list of specific third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in Minnesota and Oregon).</li>
              <li>Right to obtain a list of third parties to which we have sold personal data (as permitted by applicable law, including the privacy law in Connecticut).</li>
              <li>Right to review, understand, question, and depending on where you live, correct how personal data has been profiled (as permitted by applicable law, including the privacy law in Connecticut and Minnesota).</li>
              <li>Right to limit use and disclosure of sensitive personal data (as permitted by applicable law, including the privacy law in California).</li>
              <li>Right to opt out of the collection of sensitive data and personal data collected through the operation of a voice or facial-recognition feature (as permitted by applicable law, including the privacy law in Florida).</li>
            </ul>

            <h3>How to exercise your rights</h3>
            <p>
              To exercise these rights, you can contact us by{' '}
              <a
                href="https://app.termly.io/dsar/815d1b81-bf38-4ebe-906f-21f2e5a3add0"
                target="_blank"
                rel="noopener noreferrer"
              >
                submitting a data subject access request
              </a>
              , by emailing us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>,
              or by referring to the contact details at the bottom of this document.
            </p>
            <p>
              Under certain US state data-protection laws, you can designate an authorised
              agent to make a request on your behalf. We may deny a request from an
              authorised agent that does not submit proof that they have been validly
              authorised to act on your behalf in accordance with applicable laws.
            </p>

            <h3>Request verification</h3>
            <p>
              Upon receiving your request, we will need to verify your identity to
              determine you are the same person about whom we have the information in our
              system. We will only use personal information provided in your request to
              verify your identity or authority to make the request. However, if we cannot
              verify your identity from the information already maintained by us, we may
              request that you provide additional information for the purposes of
              verifying your identity and for security or fraud-prevention purposes.
            </p>
            <p>
              If you submit the request through an authorised agent, we may need to
              collect additional information to verify your identity before processing
              your request, and the agent will need to provide a written and signed
              permission from you to submit such request on your behalf.
            </p>

            <h3>Appeals</h3>
            <p>
              Under certain US state data-protection laws, if we decline to take action
              regarding your request, you may appeal our decision by emailing us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will inform you
              in writing of any action taken or not taken in response to the appeal,
              including a written explanation of the reasons for the decision. If your
              appeal is denied, you may submit a complaint to your state attorney general.
            </p>
          </section>

          <section id="policyupdates">
            <h2>13. Do we make updates to this notice?</h2>
            <p className="legal-callout">
              <strong>In short:</strong>{' '}
              <em>Yes, we will update this notice as necessary to stay compliant with relevant laws.</em>
            </p>
            <p>
              We may update this Privacy Notice from time to time. The updated version
              will be indicated by an updated "Last updated" date at the top of this
              Privacy Notice. If we make material changes to this Privacy Notice, we may
              notify you either by prominently posting a notice of such changes or by
              directly sending you a notification. We encourage you to review this Privacy
              Notice frequently to be informed of how we are protecting your information.
            </p>
          </section>

          <section id="contact">
            <h2>14. How can you contact us about this notice?</h2>
            <p>
              If you have questions or comments about this notice, you may email us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section id="request">
            <h2>15. How can you review, update, or delete the data we collect from you?</h2>
            <p>
              Based on the applicable laws of your country or state of residence in the
              US, you may have the right to request access to the personal information we
              collect from you, details about how we have processed it, correct
              inaccuracies, or delete your personal information. You may also have the
              right to withdraw your consent to our processing of your personal
              information. These rights may be limited in some circumstances by applicable
              law. To request to review, update, or delete your personal information,
              please{' '}
              <a
                href="https://app.termly.io/dsar/815d1b81-bf38-4ebe-906f-21f2e5a3add0"
                target="_blank"
                rel="noopener noreferrer"
              >
                fill out and submit a data subject access request
              </a>
              .
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
