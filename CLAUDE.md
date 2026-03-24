\## Self Beacon — burnout-reset project



Product: Free burnout assessment app + personalized 30-day recovery guides.

Brand: Self Beacon  |  Domain: selfbeacon.com

GitHub repo: burnout-reset



\### Files in this folder

\- index.html — the assessment app hosted on GitHub Pages

\- build\_slides.py — regenerates all 6 archetype PDF slide decks

\- burnout-api/ — Netlify serverless function for live guide generation

\- 6 PDF files — static fallback guides, one per archetype



\### GitHub Pages URL

https://burnoutreset.github.io/burnout-reset



\### Payhip products (update these when created)

\- Early Burnout:    https://payhip.com/b/St81q

\- Overextended:     https://payhip.com/b/ZSIj1

\- Numb One:         https://payhip.com/b/PygEe

\- Exhausted Body:   https://payhip.com/b/Gw0Hq

\- Lost One:         https://payhip.com/b/9zDKn

\- Pressure Cooker:  https://payhip.com/b/2Aa6c

\- All products: $14.99  |  35% affiliate commission



\### Key commands

\- python build\_slides.py           → rebuild all 6 PDFs

\- cd burnout-api \&\& npm install    → install API dependencies

\- cd burnout-api \&\& npx netlify dev → test function locally



\### Critical rule

ANTHROPIC\_API\_KEY lives in Netlify environment variables only.

Never put it in any file in this repo.

```



\---



\*\*STEP 10 — Open Claude Code Desktop and point it at your folder\*\*



Since you have Claude Code Desktop (not the terminal version), open it from your Start menu or taskbar.



When it opens, you need to tell it which folder to work in. Look for one of these options depending on your version:



\- A button that says \*\*"Open folder"\*\* or \*\*"Select project"\*\*

\- A file browser on the left side

\- A prompt that says something like "Which directory should I work in?"



Navigate to and select: `C:\\Users\\YourName\\Desktop\\burnout-reset`



Once the folder is open, Claude Code reads your `CLAUDE.md` automatically and knows your full project context.



\---



\*\*STEP 11 — The exact phrases to use in Claude Code Desktop\*\*



Type these into the Claude Code chat window to automate each task:



\*\*After you create your Payhip products — update the buy links in index.html:\*\*

```

In index.html find the PAYHIP\_URLS object near the top of the script 

section and update it with these real URLs:

overextended: "https://payhip.com/b/XXXXX"

numb: "https://payhip.com/b/XXXXX"

exhausted: "https://payhip.com/b/XXXXX"

lost: "https://payhip.com/b/XXXXX"

pressure: "https://payhip.com/b/XXXXX"

early: "https://payhip.com/b/XXXXX"

Then commit the change to GitHub with message "Add Payhip product URLs"

```



\*\*Push any file change to GitHub:\*\*

```

Commit all changed files and push to GitHub with message "\[your message here]"

```



\*\*Deploy burnout-api to Netlify after making changes:\*\*

```

Navigate into burnout-api, make sure dependencies are installed, 

then tell me what to do next to deploy this to Netlify

```



\*\*Rebuild the PDFs if you ever update archetype content:\*\*

```

Run build\_slides.py and confirm all 6 PDFs were generated successfully

```



\*\*Check everything is wired up correctly before going live:\*\*

```

Review index.html and confirm the PAYHIP\_URLS all have real URLs 

and no PAYHIP\_URL\_HERE placeholders remain

```



\---



\*\*STEP 12 — Push your new files to GitHub\*\*



The `burnout-api` folder and `CLAUDE.md` you just created are on your computer but not yet on GitHub. Tell Claude Code Desktop:

```

Add burnout-api folder and CLAUDE.md to the repo, then commit 

and push everything to GitHub with message "Add API function and project context"

```



Claude Code will run the git commands for you. Once pushed, your GitHub repo will have everything in one place.



\---



\*\*Your folder should now look like this:\*\*

```

burnout-reset/

&#x20; index.html                          ← assessment app (already on GitHub)

&#x20; CLAUDE.md                           ← project context for Claude Code

&#x20; build\_slides.py                     ← PDF generator

&#x20; Burnout-Reset-EarlyBurnout.pdf      ← static fallback

&#x20; Burnout-Reset-Overextended.pdf

&#x20; Burnout-Reset-NumbOne.pdf

&#x20; Burnout-Reset-ExhaustedBody.pdf

&#x20; Burnout-Reset-LostOne.pdf

&#x20; Burnout-Reset-PressureCooker.pdf

&#x20; burnout-api/

&#x20;   netlify.toml

&#x20;   package.json

&#x20;   netlify/

&#x20;     functions/

&#x20;       generate.js

&#x20;   public/

&#x20;     personalize.html

&#x20;   node\_modules/                     ← created by npm install, don't push this

```



One last thing — tell Claude Code to create a `.gitignore` file so the `node\_modules` folder never gets pushed to GitHub (it's huge and unnecessary):

```

Create a .gitignore file that excludes node\_modules and any .env files, 

then commit and push it

