"""Synthetic, network-free ASGI responsiveness and PDF extraction benchmark.

Run: python backend/tools/benchmark_backend_latency.py
Outputs JSON to stdout; ordinary content-free application logs go to stderr.
The 600 ms provider wait is injected. Health completion is measured from the
upload start, so event-loop scheduling delays remain visible in the result.
"""
import asyncio
import json
import os
import statistics
import sys
import time
from unittest.mock import patch
from pathlib import Path

os.environ.update(SUPABASE_URL='http://127.0.0.1:9', SUPABASE_SECRET_KEY='test-key', ENABLE_REMINDER_SCHEDULER='false')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
started = time.perf_counter()
import main
startup_ms = (time.perf_counter()-started)*1000
import httpx
import pymupdf

def make_contract():
    return main.ContractData(**{field: None for field in main.ContractData.model_fields})

async def run():
    doc=pymupdf.open()
    doc.new_page().insert_text((72,72), 'Synthetic contract. Renewal requires 30 days notice.')
    pdf=doc.tobytes();doc.close()
    results=[]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://local') as client:
        for _ in range(3):
            provider_started = asyncio.Event()
            loop = asyncio.get_running_loop()
            def slow_provider(_):
                loop.call_soon_threadsafe(provider_started.set)
                time.sleep(0.6)
                return make_contract()
            async def health_during_provider():
                await provider_started.wait()
                start=time.perf_counter()
                response=await client.get('/health')
                return {'health_ms':(time.perf_counter()-start)*1000,'status':response.status_code,
                        'health_completed_at':time.perf_counter()}
            with patch.object(main,'get_authenticated_context',return_value={'organization_id':'synthetic'}), \
                 patch.object(main,'ensure_contract_not_duplicate'), \
                 patch.object(main,'extract_contract_data',side_effect=slow_provider), \
                 patch.object(main,'calculate_renewal_intelligence',return_value={}):
                start=time.perf_counter()
                health=asyncio.create_task(health_during_provider())
                response=await client.post('/contracts/analyze',headers={'Authorization':'Bearer synthetic'},files={'file':('synthetic.pdf',pdf,'application/pdf')})
                result=await health
                result.update(analyze_ms=(time.perf_counter()-start)*1000,
                    health_completion_since_upload_ms=(result.pop('health_completed_at')-start)*1000,
                    analyze_status=response.status_code)
                results.append(result)
    pdf_results=[]
    for count in [1,20,200]:
        doc=pymupdf.open()
        for _ in range(count):doc.new_page().insert_textbox((50,50,550,750),('Synthetic renewal contract text. '*20))
        content=doc.tobytes();doc.close()
        times=[]
        for _ in range(5):
            start=time.perf_counter();pages=main.extract_pdf_pages(content);times.append((time.perf_counter()-start)*1000)
        pdf_results.append({'pages':count,'bytes':len(content),'characters':sum(map(len,pages)),'median_ms':statistics.median(times)})
    print(json.dumps({'import_startup_ms':startup_ms,'concurrency':results,'pdf':pdf_results},indent=2))

asyncio.run(run())
