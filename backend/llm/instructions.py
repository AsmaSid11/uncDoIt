import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv
from audio_generator import generate_audio

load_dotenv()

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


def get_next_action(
    query: str,
    elements: list[dict],
    steps_completed: list[str],
    page_context: dict | None = None
) -> dict:
    page_context = page_context or {}

    system_prompt = """You are UncDoIt, an empathetic AI digital co-pilot helping first-time internet users navigate websites. 
Your job is to act as a GPS for the web: look at the user's goal, analyze what they have already done, evaluate the current page, and provide the single next instruction.

CRITICAL DIRECTIVE - AVOID REPETITION:
You are prone to repeating steps if you do not check history. Before selecting a 'navi_id', you MUST cross-reference it with 'Steps already completed'. NEVER recommend interacting with an element the user has already successfully interacted with during this task sequence, unless a visible error requires them to try again. Always progress the workflow forward.

Follow this Reasoning Protocol internally before generating your JSON:
1. State Check: What has the user already done? (Review 'Steps already completed').
2. Goal Check: What is the overall objective based on the user query?
3. Context Check: What is on the screen right now? (Review 'Interactive elements' and 'Page context').
4. Action Selection: Identify the single NEXT logical element required to advance the task.

Rules for Output generation:
- Action Types: Provide exactly ONE action ("click", "type", "scroll", or "wait"). 
- Typing: If the action is "type", you must provide the exact string in the "value" field. Otherwise, leave "value" empty.
- NBU Communication: 'voice_text' must be painfully simple. Imagine speaking to someone who has never touched a smartphone. Use visual, physical cues (e.g., "Touch the long white box at the top") instead of tech jargon (e.g., "Focus the input field").
- Localization: Detect the language from the user query. Set the correct 'lang' code and provide the native script translation in 'transcription'.
- Completion: If the task is fully accomplished based on the history and current screen, set 'is_done' to true and provide a simple, encouraging success message in 'voice_text'.
- Dead Ends: If you cannot find the correct next element to advance the goal, set 'navi_id' to -1, set 'is_done' to false, and use 'voice_text' to ask the user to scroll or clarify."""

    prompt = f"""User query: {query}
Steps already completed: {json.dumps(steps_completed, ensure_ascii=False)}

Page context:
{json.dumps(page_context, ensure_ascii=False, indent=2)}

Interactive elements on the current page:
{json.dumps(elements, ensure_ascii=False, indent=2)}

Infer the task from the query, page context, and elements, then return the single next action the user should take."""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "current_task":  {"type": "STRING"},
                    "navi_id":       {"type": "INTEGER"},
                    "voice_text":    {"type": "STRING"},
                    "action":        {"type": "STRING", "enum": ["click", "type", "scroll", "wait"]},
                    "value":         {"type": "STRING"},
                    "is_done":       {"type": "BOOLEAN"},
                    "lang":          {"type": "STRING", "enum": ["hi-IN", "bn-IN", "ta-IN", "te-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "od-IN", "en-IN"]},
                    "transcription": {"type": "STRING"}
                },
                "required": ["current_task", "navi_id", "voice_text", "action", "value", "is_done", "lang", "transcription"]
            },
            temperature=0.1,
            max_output_tokens=8096,
        )
    )

    return json.loads(response.text)


if __name__ == "__main__":
    test_page_context = {
  "title": "PAN Card Services Online | Apply for PAN Card | Easy PAN Card Application",
  "url": "https://onlineservices.proteantech.in/paam/endUserRegisterContact.html",
  "path": "/paam/endUserRegisterContact.html",
  "pageText": "Online PAN application As per the revised Income-tax Rules, 2026, w.e.f. April 1, 2026, Aadhaar will NOT be accepted as Proof of Date of Birth along with PAN application. PAN applicants are required to submit Proof of Date of Birth (other than Aadhaar) while applying for PAN. As per ITD guidelines,'Request for New PAN Card or/and Changes or Correction in PAN Data' application is presently to be used only for update/correction in PAN database. For procedure to link Aadhaar with PAN, please click here. As per provisions of Section 272B of the Income Tax Act., 1961, a penalty of ₹ 10,000 can be levied on possession of more than one PAN. New Application Resume Application (With Token Number) Select PAN Application Type* (New or Change Request) ----Please Select------ New PAN - Indian Citizen (Form 49A) New PAN - Foreign Citizen (Form 49AA) Changes or Correction in existing PAN Data / Reprint of PAN Card (No changes in existing PAN Data) ----Please Select------ Select Applicant Category* (Individual,Trust,HUF,...) ----Please Select------ INDIVIDUAL ASSOCIATION OF PERSONS BODY OF INDIVIDUALS COMPANY TRUST LIMITED LIABILITY PARTNERSHIP FIRM GOVERNMENT HINDU UNDIVIDED FAMILY ARTIFICIAL JURIDICAL PERSON LOCAL AUTHORITY ----Please Select------ Applicant information Title* ----Please Select------ ----Please Select------ Last Name / Surname* First Name Middle Name Date of Birth / Incorporation / Formation (DD/MM/YYYY)* Email ID* Mobile Number* By submitting data to us and/or using our Protean e-Gov TIN web site https://onlineservices.proteantech.in/paam/endUserRegisterContact.html you give your consent that all personal data/information that you submit to avail tax related services from Protean eGov Technologies Limited may be received, stored, processed, transmitted and or made available for view /use as mandated by law or otherwise, shall be dealt with by us in the manner and for the purposes specified / as described in the privacy policy or as mandated by law. I have also re"
}

    test_elements = [
  {
    "navi_id": 0,
    "tag": "SELECT",
    "id": "",
    "text": "EnglishGujaratiHindiMalayalamMarathiNepaliSanskritTamilTeluguUrdu",
    "context": "Online PAN application"
  },
  {
    "navi_id": 1,
    "tag": "A",
    "id": "",
    "text": "Cookie Policy.",
    "context": "Online PAN application"
  },
  {
    "navi_id": 2,
    "tag": "BUTTON",
    "id": "",
    "text": "Reject All",
    "context": "Online PAN application"
  },
  {
    "navi_id": 3,
    "tag": "BUTTON",
    "id": "",
    "text": "Allow Selection",
    "context": "Online PAN application"
  },
  {
    "navi_id": 4,
    "tag": "BUTTON",
    "id": "",
    "text": "Allow all",
    "context": "Online PAN application"
  },
  {
    "navi_id": 5,
    "tag": "INPUT",
    "id": "uniqueKey",
    "text": "9165-464cbec8201",
    "context": "Online PAN application"
  },
  {
    "navi_id": 6,
    "tag": "INPUT",
    "id": "saltKey",
    "text": "2F4Db42bbe348D04cEC39d21F4EA8Fc2",
    "context": "Online PAN application"
  },
  {
    "navi_id": 7,
    "tag": "INPUT",
    "id": "IVKey",
    "text": "Ce2BebDC7CCCa615abf39E348Bb158Bd",
    "context": "Online PAN application"
  },
  {
    "navi_id": 9,
    "tag": "INPUT",
    "id": "",
    "text": "Home",
    "context": "Online PAN application"
  },
  {
    "navi_id": 10,
    "tag": "INPUT",
    "id": "",
    "text": "Reprint Of PAN Card",
    "context": "Online PAN application"
  },
  {
    "navi_id": 11,
    "tag": "INPUT",
    "id": "",
    "text": "Download e-PAN/ e-PAN XML",
    "context": "Online PAN application"
  },
  {
    "navi_id": 12,
    "tag": "INPUT",
    "id": "",
    "text": "Know Status Of PAN Application",
    "context": "Online PAN application"
  },
  {
    "navi_id": 13,
    "tag": "A",
    "id": "",
    "text": "here.",
    "context": "Online PAN application"
  },
  {
    "navi_id": 14,
    "tag": "A",
    "id": "newappl",
    "text": "New Application",
    "context": "Select PAN Application Type*\n(New or Change Request)"
  },
  {
    "navi_id": 15,
    "tag": "A",
    "id": "resumeappl",
    "text": "Resume Application\n          (With Token Number)",
    "context": "Select PAN Application Type*\n(New or Change Request)"
  },
  {
    "navi_id": 21,
    "tag": "INPUT",
    "id": "",
    "text": "https://onlineservices.proteantech.in/paam/endUserRegisterContact.html?null",
    "context": "Select PAN Application Type*\n(New or Change Request)"
  },
  {
    "navi_id": 24,
    "tag": "SELECT",
    "id": "type",
    "text": "----Please Select------\nNew PAN - Indian Citizen (Form 49A)\nNew PAN - Foreign Citizen (Form 49AA)\nChanges or Correction in existing PAN Data / Reprint of PAN Card (No changes in existing PAN Data)",
    "context": "Select PAN Application Type*\n(New or Change Request)"
  },
  {
    "navi_id": 25,
    "tag": "SELECT",
    "id": "cat_applicant1",
    "text": "----Please Select------\nINDIVIDUAL\nASSOCIATION OF PERSONS\nBODY OF INDIVIDUALS\nCOMPANY\nTRUST\nLIMITED LIABILITY PARTNERSHIP\nFIRM\nGOVERNMENT\nHINDU UNDIVIDED FAMILY\nARTIFICIAL JURIDICAL PERSON\nLOCAL AUTHORITY",
    "context": "Select Applicant Category*\n(Individual,Trust,HUF,...)"
  },
  {
    "navi_id": 26,
    "tag": "SELECT",
    "id": "rvNameInitials",
    "text": "----Please Select------",
    "context": "Title*"
  },
  {
    "navi_id": 27,
    "tag": "INPUT",
    "id": "l_name_end",
    "text": "",
    "context": "Last Name / Surname*"
  },
  {
    "navi_id": 28,
    "tag": "INPUT",
    "id": "f_name_end",
    "text": "",
    "context": "First Name"
  },
  {
    "navi_id": 29,
    "tag": "INPUT",
    "id": "m_name_end",
    "text": "",
    "context": "Middle Name"
  },
  {
    "navi_id": 30,
    "tag": "INPUT",
    "id": "date_of_birth_reg",
    "text": "",
    "context": "Date of Birth / Incorporation / Formation (DD/MM/YYYY)*"
  },
  {
    "navi_id": 31,
    "tag": "INPUT",
    "id": "email_id2",
    "text": "",
    "context": "Email ID*"
  },
  {
    "navi_id": 32,
    "tag": "INPUT",
    "id": "rvContactNo",
    "text": "",
    "context": "Mobile Number*"
  },
  {
    "navi_id": 33,
    "tag": "INPUT",
    "id": "citizenCr1",
    "text": "I",
    "context": "Whether Citizen of India*"
  },
  {
    "navi_id": 34,
    "tag": "INPUT",
    "id": "citizenCr2",
    "text": "F",
    "context": "Whether Citizen of India*"
  },
  {
    "navi_id": 35,
    "tag": "INPUT",
    "id": "rvPanNum",
    "text": "",
    "context": "PAN NUMBER*"
  },
  {
    "navi_id": 36,
    "tag": "INPUT",
    "id": "consent",
    "text": "consent",
    "context": "Title*"
  },
  {
    "navi_id": 37,
    "tag": "A",
    "id": "",
    "text": "https://onlineservices.proteantech.in/paam/endUserRegisterContact.html",
    "context": "Title*"
  },
  {
    "navi_id": 38,
    "tag": "A",
    "id": "",
    "text": "https://tinpan.proteantech.in/privacy-policy",
    "context": "Title*"
  },
  {
    "navi_id": 39,
    "tag": "INPUT",
    "id": "fullformConsent",
    "text": "",
    "context": "Title*"
  },
  {
    "navi_id": 40,
    "tag": "SELECT",
    "id": "languageDropdown",
    "text": "English\nHindi\nGujarati\nMarathi\nTamil\nTelugu\nBengali",
    "context": "Select Language"
  },
  {
    "navi_id": 41,
    "tag": "BUTTON",
    "id": "playAudio",
    "text": "Play audio",
    "context": "Title*"
  },
  {
    "navi_id": 42,
    "tag": "BUTTON",
    "id": "pauseAudio",
    "text": "Stop audio",
    "context": "Title*"
  },
  {
    "navi_id": 43,
    "tag": "TEXTAREA",
    "id": "g-recaptcha-response",
    "text": "",
    "context": "Title*"
  },
  {
    "navi_id": 44,
    "tag": "INPUT",
    "id": "valueforpage",
    "text": "",
    "context": "Select PAN Application Type*\n(New or Change Request)"
  },
  {
    "navi_id": 45,
    "tag": "BUTTON",
    "id": "resetForm1",
    "text": "Reset",
    "context": "Select PAN Application Type*\n(New or Change Request)"
  },
  {
    "navi_id": 46,
    "tag": "BUTTON",
    "id": "submitForm",
    "text": "Submit",
    "context": "Select PAN Application Type*\n(New or Change Request)"
  },
  {
    "navi_id": 47,
    "tag": "INPUT",
    "id": "token_number",
    "text": "",
    "context": "Enter token number sent to your email ID"
  },
  {
    "navi_id": 48,
    "tag": "INPUT",
    "id": "email_id1",
    "text": "",
    "context": "Enter your Email ID used previously"
  },
  {
    "navi_id": 49,
    "tag": "INPUT",
    "id": "dob",
    "text": "DD/MM/YYYY",
    "context": "Enter your Date of Birth used previously"
  },
  {
    "navi_id": 50,
    "tag": "TEXTAREA",
    "id": "g-recaptcha-response-1",
    "text": "",
    "context": "Enter token number sent to your email ID"
  },
  {
    "navi_id": 51,
    "tag": "BUTTON",
    "id": "resetForm",
    "text": "Reset",
    "context": "Enter token number sent to your email ID"
  },
  {
    "navi_id": 52,
    "tag": "BUTTON",
    "id": "submitFormLogin",
    "text": "Submit",
    "context": "Enter token number sent to your email ID"
  },
  {
    "navi_id": 53,
    "tag": "BUTTON",
    "id": "cancelToken",
    "text": "Cancel Token",
    "context": "Enter token number sent to your email ID"
  },
  {
    "navi_id": 55,
    "tag": "A",
    "id": "",
    "text": "Protean eGov Technologies Limited",
    "context": "Online PAN application"
  },
  {
    "navi_id": 58,
    "tag": "BUTTON",
    "id": "",
    "text": "Apply",
    "context": ""
  },
  {
    "navi_id": 59,
    "tag": "BUTTON",
    "id": "",
    "text": "Cancel",
    "context": ""
  },
  {
    "navi_id": 62,
    "tag": "BUTTON",
    "id": "",
    "text": "Apply",
    "context": ""
  },
  {
    "navi_id": 63,
    "tag": "BUTTON",
    "id": "",
    "text": "Cancel",
    "context": ""
  }
]

    action = get_next_action(
        query="I need help with applying for a new PAN card",
        elements=test_elements,
        steps_completed=[
            "To start your new PAN card application, please click on the 'Select' box under 'Select PAN Application Type' and choose 'New PAN - Indian Citizen (Form 49A)'",
            ],
        page_context=test_page_context
    )

    print(json.dumps(action, ensure_ascii=False, indent=2))
    # generate_audio(
    #         transcript_text=action["transcription"],
    #         lang=action["lang"],
    # )