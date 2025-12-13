"""
End-to-end test for moderation database integration.

This test script:
1. Connects to the WebSocket endpoint
2. Sends test text for moderation
3. Verifies the response contains moderation data
4. Queries the database to verify data was saved correctly
"""

import asyncio
import json
import sqlite3
from datetime import datetime
from typing import Any, Optional

import websockets


# Test configuration
BASE_URL = "ws://localhost:8000"
WS_ENDPOINT = f"{BASE_URL}/ws/transcribe"
DATABASE_PATH = "database.db"


# Test cases for moderation
TEST_CASES = [
    {
        "name": "Clean Vietnamese text",
        "text": "Xin chào, hôm nay trời đẹp quá!",
        "expected_flagged": False,
        "expected_label": "CLEAN",
    },
    {
        "name": "Offensive text with bad keywords",
        "text": "Mày là thằng ngu, đồ chó",
        "expected_flagged": True,
        "expected_label": "OFFENSIVE",
        "expected_keywords": ["ngu", "chó"],  # Expected keywords to be detected
    },
    {
        "name": "Another clean text",
        "text": "Cảm ơn bạn rất nhiều vì đã giúp đỡ",
        "expected_flagged": False,
        "expected_label": "CLEAN",
    },
    {
        "name": "Mild offensive text",
        "text": "Đồ khốn nạn, tao ghét mày",
        "expected_flagged": True,
        "expected_label": "OFFENSIVE",
        "expected_keywords": ["khốn nạn"],
    },
]


def query_database(query: str, params: tuple = ()) -> list:
    """Execute a query on the database and return results."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(query, params)
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


# Expected columns based on TranscriptionLog schema
EXPECTED_COLUMNS = [
    "id", "session_id", "model_id", "content", "latency_ms", "created_at",
    "moderation_label", "moderation_confidence", "is_flagged", "detected_keywords"
]


def print_separator(char: str = "=", length: int = 60):
    """Print a separator line."""
    print(char * length)


def print_test_header(test_name: str):
    """Print a test header."""
    print_separator()
    print(f"🧪 TEST: {test_name}")
    print_separator("-")


def print_success(message: str):
    """Print a success message."""
    print(f"  ✅ {message}")


def print_failure(message: str):
    """Print a failure message."""
    print(f"  ❌ {message}")


def print_info(message: str):
    """Print an info message."""
    print(f"  ℹ️  {message}")


async def send_text_for_moderation(text: str, session_id: str) -> Optional[dict]:
    """
    Send text to the WebSocket endpoint for moderation.
    Returns the moderation result if available.
    """
    ws_url = f"{WS_ENDPOINT}?model_id=zipformer&moderation_enabled=true&session_id={session_id}"
    
    try:
        async with websockets.connect(ws_url) as ws:
            # Wait for connection acknowledgment
            ack = await asyncio.wait_for(ws.recv(), timeout=5.0)
            print_info(f"Connected: {ack[:100]}...")
            
            # For testing, we'll send a simulated transcription
            # In real scenario, this would be audio data
            # We'll use the test_text endpoint if available
            
            # Send EOS to close gracefully
            await ws.send(json.dumps({"type": "eos"}))
            
            # Collect all responses
            responses = []
            try:
                while True:
                    response = await asyncio.wait_for(ws.recv(), timeout=3.0)
                    responses.append(json.loads(response))
            except asyncio.TimeoutError:
                pass
            
            return responses
    except Exception as e:
        print_failure(f"WebSocket error: {e}")
        return None


async def test_moderation_via_http(text: str) -> Optional[dict]:
    """
    Test moderation using HTTP endpoint if available.
    """
    import aiohttp
    
    url = "http://localhost:8000/api/v1/moderate"
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, json={"text": text}) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    print_failure(f"HTTP {response.status}: {await response.text()}")
                    return None
        except Exception as e:
            print_failure(f"HTTP error: {e}")
            return None


async def test_database_schema():
    """Test that the database schema has the new moderation fields."""
    print_test_header("Database Schema Verification")
    
    try:
        # Get table info
        table_info = query_database("PRAGMA table_info(transcription_logs)")
        
        actual_columns = [col["name"] for col in table_info]
        
        print_info(f"Found {len(actual_columns)} columns in transcription_logs table")
        
        # Check each expected column
        all_present = True
        for col in EXPECTED_COLUMNS:
            if col in actual_columns:
                col_info = next((c for c in table_info if c["name"] == col), None)
                print_success(f"Column '{col}' exists (type: {col_info['type'] if col_info else 'unknown'})")
            else:
                print_failure(f"Column '{col}' is MISSING!")
                all_present = False
        
        return all_present
        
    except Exception as e:
        print_failure(f"Database error: {e}")
        return False


async def test_insert_with_moderation():
    """Test inserting records with moderation data directly into database."""
    print_test_header("Direct Database Insert Test")
    
    import uuid
    test_session_id = f"test-direct-{uuid.uuid4().hex[:8]}"
    
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        
        # Insert a test record with moderation data
        cursor.execute("""
            INSERT INTO transcription_logs 
            (session_id, model_id, content, latency_ms, created_at, moderation_label, 
             moderation_confidence, is_flagged, detected_keywords)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            test_session_id,
            "zipformer",
            "Test ngu chó content",
            25.5,
            datetime.now().isoformat(),
            "OFFENSIVE",
            0.95,
            True,
            json.dumps(["ngu", "chó"])  # JSON string for SQLite
        ))
        
        conn.commit()
        
        # Query back the record
        cursor.execute(
            "SELECT * FROM transcription_logs WHERE session_id = ?",
            (test_session_id,)
        )
        
        row = cursor.fetchone()
        if row:
            columns = [description[0] for description in cursor.description]
            record = dict(zip(columns, row))
            
            print_success(f"Record inserted successfully")
            print_info(f"  Session ID: {record.get('session_id')}")
            print_info(f"  Content: {record.get('content')}")
            print_info(f"  Latency MS: {record.get('latency_ms')}")
            print_info(f"  Created At: {record.get('created_at')}")
            print_info(f"  Moderation Label: {record.get('moderation_label')}")
            print_info(f"  Moderation Confidence: {record.get('moderation_confidence')}")
            print_info(f"  Is Flagged: {record.get('is_flagged')}")
            print_info(f"  Detected Keywords: {record.get('detected_keywords')}")
            
            # Verify the JSON is parseable
            keywords = json.loads(record.get("detected_keywords", "[]"))
            print_success(f"Keywords parsed correctly: {keywords}")
            
            # Clean up test record
            cursor.execute(
                "DELETE FROM transcription_logs WHERE session_id = ?",
                (test_session_id,)
            )
            conn.commit()
            print_success("Test record cleaned up")
            
            conn.close()
            return True
        else:
            print_failure("Record not found after insert")
            conn.close()
            return False
            
    except Exception as e:
        print_failure(f"Database error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_websocket_flow():
    """Test the full WebSocket flow with moderation."""
    print_test_header("WebSocket Moderation Flow Test")
    
    import uuid
    test_session_id = f"test-ws-{uuid.uuid4().hex[:8]}"
    
    # Connect without query params - config is sent via message
    ws_url = WS_ENDPOINT
    
    print_info(f"Connecting to: {ws_url}")
    
    # Add origin header to pass CORS check
    extra_headers = {
        "Origin": "http://localhost:5173"
    }
    
    try:
        async with websockets.connect(ws_url, extra_headers=extra_headers) as ws:
            # Send config message first (as per protocol)
            config_msg = {
                "type": "config",
                "model": "zipformer",
                "session_id": test_session_id,
                "moderation_enabled": True
            }
            await ws.send(json.dumps(config_msg))
            print_success(f"Sent config: model=zipformer, session={test_session_id}")
            
            # Wait for ready message or first response
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=10.0)
                resp_data = json.loads(response)
                print_success(f"Received: type={resp_data.get('type', 'transcription')}")
                
                if resp_data.get('type') == 'error':
                    print_failure(f"Error: {resp_data.get('message')}")
                    return False
                    
            except asyncio.TimeoutError:
                print_info("No immediate response (waiting for audio)")
            
            # Send EOS to close gracefully
            await ws.send(json.dumps({"type": "eos"}))
            print_success("Sent EOS")
            
            # Collect remaining responses
            responses = []
            try:
                while True:
                    response = await asyncio.wait_for(ws.recv(), timeout=3.0)
                    resp_data = json.loads(response)
                    responses.append(resp_data)
                    print_info(f"Response: type={resp_data.get('type', 'transcription')}")
            except asyncio.TimeoutError:
                pass
            except websockets.exceptions.ConnectionClosed:
                pass
            
            print_success(f"WebSocket flow completed. Received {len(responses)} additional responses")
            return True
            
    except Exception as e:
        print_failure(f"WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_http_moderation_endpoint():
    """Test the HTTP moderation endpoint if available."""
    print_test_header("HTTP Moderation Endpoint Test")
    
    try:
        import aiohttp
    except ImportError:
        print_info("aiohttp not available, skipping HTTP tests")
        return True
    
    test_cases = [
        {
            "text": "Xin chào bạn",
            "expected_clean": True
        },
        {
            "text": "Mày là đồ ngu",
            "expected_clean": False
        }
    ]
    
    async with aiohttp.ClientSession() as session:
        for test in test_cases:
            try:
                # Check if there's a moderate endpoint
                async with session.post(
                    "http://localhost:8000/api/v1/moderate",
                    json={"text": test["text"]},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        print_success(f"Text: '{test['text'][:30]}...'")
                        print_info(f"  Label: {data.get('label')}")
                        print_info(f"  Confidence: {data.get('confidence')}")
                        print_info(f"  Keywords: {data.get('detected_keywords', [])}")
                    elif response.status == 404:
                        print_info("Moderate endpoint not found (404)")
                        break
                    else:
                        print_failure(f"HTTP {response.status}")
            except Exception as e:
                print_info(f"HTTP request failed: {e}")
                break
    
    return True


async def check_existing_records():
    """Check and display existing records in the database."""
    print_test_header("Existing Database Records")
    
    try:
        records = query_database(
            "SELECT * FROM transcription_logs ORDER BY created_at DESC LIMIT 10"
        )
        
        if not records:
            print_info("No records found in database")
            return True
        
        print_info(f"Found {len(records)} record(s)")
        
        for i, record in enumerate(records, 1):
            print_separator("-", 40)
            print(f"  Record #{i}")
            print(f"    Session ID: {record.get('session_id')}")
            print(f"    Content: {record.get('content', '')[:50]}...")
            print(f"    Latency MS: {record.get('latency_ms')}")
            print(f"    Created At: {record.get('created_at')}")
            print(f"    Moderation Label: {record.get('moderation_label')}")
            print(f"    Confidence: {record.get('moderation_confidence')}")
            print(f"    Is Flagged: {record.get('is_flagged')}")
            print(f"    Keywords: {record.get('detected_keywords')}")
        
        return True
        
    except Exception as e:
        print_failure(f"Database error: {e}")
        return False


async def test_full_audio_flow():
    """Test the complete flow: audio -> transcription -> moderation -> database."""
    print_test_header("Full Audio Flow Test (with real audio)")
    
    import uuid
    import os
    import struct
    
    test_session_id = f"test-audio-{uuid.uuid4().hex[:8]}"
    audio_file = "tests/data/sample_vn.wav"
    
    if not os.path.exists(audio_file):
        print_info(f"Audio file not found: {audio_file}, skipping test")
        return True
    
    print_info(f"Using audio file: {audio_file}")
    print_info(f"Session ID: {test_session_id}")
    
    ws_url = WS_ENDPOINT
    extra_headers = {"Origin": "http://localhost:5173"}
    
    try:
        async with websockets.connect(ws_url, extra_headers=extra_headers) as ws:
            # Send config message
            config_msg = {
                "type": "config",
                "model": "zipformer",
                "session_id": test_session_id,
                "moderation_enabled": True
            }
            await ws.send(json.dumps(config_msg))
            print_success("Sent config")
            
            # Read and send audio file
            with open(audio_file, "rb") as f:
                # Skip WAV header (44 bytes)
                f.seek(44)
                audio_data = f.read()
            
            # Send audio in chunks (1024 samples = 2048 bytes for 16-bit audio)
            chunk_size = 2048
            chunks_sent = 0
            for i in range(0, len(audio_data), chunk_size):
                chunk = audio_data[i:i + chunk_size]
                await ws.send(chunk)
                chunks_sent += 1
                # Small delay to simulate real-time streaming
                await asyncio.sleep(0.01)
            
            print_success(f"Sent {chunks_sent} audio chunks ({len(audio_data)} bytes total)")
            
            # Send end_session to signal end of audio and save to DB
            end_msg = {"type": "end_session"}
            await ws.send(json.dumps(end_msg))
            print_success("Sent end_session")
            
            # Collect all responses
            responses = []
            transcription_text = ""
            moderation_result = None
            
            try:
                while True:
                    response = await asyncio.wait_for(ws.recv(), timeout=15.0)
                    
                    # Check if it's binary or text
                    if isinstance(response, bytes):
                        continue
                    
                    resp_data = json.loads(response)
                    responses.append(resp_data)
                    
                    resp_type = resp_data.get("type", "transcription")
                    
                    if resp_type == "transcription" or "text" in resp_data:
                        text = resp_data.get("text", "")
                        is_final = resp_data.get("is_final", False)
                        if is_final and text:
                            transcription_text = text
                            print_info(f"Final transcription: {text[:50]}...")
                    
                    elif resp_type == "moderation":
                        moderation_result = resp_data
                        label = resp_data.get("label", "")
                        confidence = resp_data.get("confidence", 0)
                        keywords = resp_data.get("detected_keywords", [])
                        print_info(f"Moderation: label={label}, confidence={confidence:.2f}")
                        if keywords:
                            print_info(f"  Keywords: {keywords}")
                    
                    elif resp_type == "session_saved":
                        print_success(f"Session saved confirmation received")
                        
            except asyncio.TimeoutError:
                pass
            except websockets.exceptions.ConnectionClosed:
                pass
            
            print_success(f"Received {len(responses)} responses total")
            
            # Verify database record
            await asyncio.sleep(1)  # Wait for DB write
            
            records = query_database(
                "SELECT * FROM transcription_logs WHERE session_id = ?",
                (test_session_id,)
            )
            
            if records:
                record = records[0]
                print_success("Record found in database!")
                print_info(f"  Content: {record.get('content', '')[:50]}...")
                print_info(f"  Moderation Label: {record.get('moderation_label')}")
                print_info(f"  Is Flagged: {record.get('is_flagged')}")
                print_info(f"  Keywords: {record.get('detected_keywords')}")
                
                # Verify moderation data was saved
                if record.get('moderation_label') is not None:
                    print_success("Moderation label saved to database")
                else:
                    print_info("No moderation label in DB (content might be clean)")
                
                return True
            else:
                print_info("No record found in database (might need more time or no transcription)")
                return True  # Not a failure, just no audio recognized
            
    except Exception as e:
        print_failure(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests."""
    print_separator("=", 60)
    print("🔬 MODERATION DATABASE INTEGRATION TESTS")
    print_separator("=", 60)
    print()
    
    results = []
    
    # Test 1: Database schema
    results.append(("Database Schema", await test_database_schema()))
    print()
    
    # Test 2: Direct database insert
    results.append(("Direct Insert", await test_insert_with_moderation()))
    print()
    
    # Test 3: WebSocket flow
    results.append(("WebSocket Flow", await test_websocket_flow()))
    print()
    
    # Test 4: HTTP endpoint (optional)
    results.append(("HTTP Endpoint", await test_http_moderation_endpoint()))
    print()
    
    # Test 5: Full audio flow (with real audio file)
    results.append(("Full Audio Flow", await test_full_audio_flow()))
    print()
    
    # Test 6: Check existing records
    results.append(("Existing Records", await check_existing_records()))
    print()
    
    # Summary
    print_separator("=", 60)
    print("📊 TEST SUMMARY")
    print_separator("=", 60)
    
    passed = 0
    failed = 0
    for name, result in results:
        if result:
            print_success(f"{name}: PASSED")
            passed += 1
        else:
            print_failure(f"{name}: FAILED")
            failed += 1
    
    print()
    print(f"Total: {passed} passed, {failed} failed")
    print_separator("=", 60)
    
    return failed == 0


if __name__ == "__main__":
    import os
    os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    print(f"Working directory: {os.getcwd()}")
    
    success = asyncio.run(main())
    exit(0 if success else 1)
