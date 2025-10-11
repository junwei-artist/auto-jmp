# === JMP SERVER MODULE ===
# Enhanced JMP Server with Safe Mode Screenshot Processing
# 
# SAFE MODE FEATURE:
# When SAFE_MODE_ENABLED = True, all screenshots are processed using OCR:
# 1. Extract text from original screenshots using Tesseract OCR
# 2. Replace screenshots with blank white images containing the extracted text
# 3. This ensures sensitive visual data is not stored while preserving text content
# 
# Configuration: Set SAFE_MODE_ENABLED = True/False in the CONFIG section below
#
# === IMPORTS ===
from flask import Flask, request, send_file, abort, jsonify, render_template_string
from flask_cors import CORS  # pip install flask-cors
import os
import time
import datetime as dt
import subprocess
import zipfile
import threading
import queue
import psutil
import json
from pathlib import Path
import applescript  # pip install applescript
import smtplib
from email.mime.text import MIMEText
import socket
import subprocess
from PIL import Image, ImageDraw, ImageFont  # pip install Pillow
import tempfile
from pathlib import Path
import io
from zipfile import ZipFile
import pytesseract  # pip install pytesseract

# === CONFIG ===
# Set BASE_TASK_DIR to "tasks" folder in the same directory as the script
BASE_TASK_DIR = Path(__file__).resolve().parent / "tasks"
JMP_START_DELAY = 4
JSL_RUN_DELAY   = 15
PORT            = 4568  # Changed port to avoid conflicts

# Safe mode configuration - when enabled, screenshots are processed with OCR
SAFE_MODE_ENABLED = True  # Set to True to enable OCR processing of screenshots
# Note: Requires Tesseract OCR to be installed on the system:
# macOS: brew install tesseract
# Linux: sudo apt-get install tesseract-ocr
# Windows: Download from https://github.com/UB-Mannheim/tesseract/wiki
MAX_WAIT_TIME   = 300  # 5 minutes max wait time
CHECK_INTERVAL  = 2    # Check every 2 seconds
STASH_DIR = (BASE_TASK_DIR / "_stash")
STASH_DIR.mkdir(parents=True, exist_ok=True)

# Email notification config
icloud_email = "junwei.s@icloud.com"
app_password = "otnj-tcgl-vuvx-mkwc"
recipient_email = [
    "sun.jun.wei2@lingyiitech.com",
    "sun.junwei@hotmail.com",
    "gan.yi.fa@lingyiitech.com",
    "Zoe.Zhao2@lingyiitech.com",
    "Rick.Cai@lingyiitech.com",
    "layla.zhang1@lingyiitech.com",
    "Peggy.Li1@lingyiitech.com",
    "lai.hong.jing@lingyiitech.com",
    "Danny.li1@lingyiitech.com",
    "fu.cheng.jia1@lingyiitech.com",
    "eric.ai@lingyiitech.com"
]

# TCP server config
TCP_SERVER_HOST = "159.75.92.201"
TCP_SERVER_PORT = 3005

# === INIT FLASK FIRST ===
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200 MB limit
BASE_TASK_DIR.mkdir(parents=True, exist_ok=True)

# Global task queue and status tracking
task_queue = queue.Queue()
task_status = {}  # task_id -> status dict
server_status = {"busy": False, "current_task": None, "queue_length": 0}
queue_lock = threading.Lock()
shutdown_flag = threading.Event()  # Flag to signal shutdown

# Broadcast system for notifications
broadcast_subscribers = set()  # Set of client connections
broadcast_lock = threading.Lock()

# === HTML Page ===
INDEX_HTML = """
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>JMP Automation Service</title>
    <style>
       body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
            max-width:42rem;margin:3rem auto;padding:0 1rem}
       h1 {font-size:1.8rem;margin-bottom:.5rem}
       label{display:block;margin:.8rem 0}
       button{padding:.5rem 1.2rem;font-size:1rem}
       #status{margin-top:1.2rem;font-style:italic;color:#666}
       .task-status{background:#f5f5f5;padding:1rem;margin:1rem 0;border-radius:4px}
       .error{color:#d32f2f}
       .success{color:#388e3c}
       .pending{color:#f57c00}
       .server-status{background:#e3f2fd;padding:1rem;margin:1rem 0;border-radius:4px;border-left:4px solid #2196f3}
       .server-busy{background:#fff3e0;border-left-color:#ff9800}
       .server-idle{background:#e8f5e8;border-left-color:#4caf50}
       .notification{position:fixed;top:20px;right:20px;padding:1rem;border-radius:4px;color:white;max-width:300px;z-index:1000;animation:slideIn 0.3s ease-out}
       .notification.info{background:#2196f3}
       .notification.warning{background:#ff9800}
       .notification.success{background:#4caf50}
       .notification.error{background:#d32f2f}
       @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
       .thumbnail-img{cursor:pointer;transition:box-shadow 0.2s;}
       .thumbnail-img:hover{box-shadow:0 0 0 2px #2196f3;z-index:2;}
      .gallery-grid{display:none;}
      .filmstrip-row{display:flex;overflow-x:auto;gap:12px;padding-bottom:8px;margin-bottom:12px;white-space:nowrap;}
      .filmstrip-thumb{width:72px;height:72px;object-fit:cover;border:2px solid #ccc;border-radius:4px;cursor:pointer;transition:border 0.2s,box-shadow 0.2s;outline:none;}
      .filmstrip-thumb.selected{border:2px solid #2196f3;box-shadow:0 0 0 2px #2196f3;}
      .filmstrip-caption{font-size:11px;margin-bottom:2px;word-break:break-all;text-align:center;max-width:72px;}
      .gallery-viewer{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:320px;}
      .gallery-view-img{max-width:80vw;max-height:60vh;border-radius:4px;box-shadow:0 0 8px #0003;}
      .gallery-view-caption{margin-top:8px;font-size:14px;color:#333;text-align:center;word-break:break-all;}
      .gallery-view-nav{display:flex;justify-content:center;gap:16px;margin-top:12px;}
      .gallery-view-btn{background:#2196f3;color:white;border:none;padding:0.4rem 1.2rem;border-radius:4px;font-size:1.1rem;cursor:pointer;transition:background 0.2s;}
      .gallery-view-btn:disabled{background:#b0bec5;cursor:not-allowed;}
      .gallery-view-btn:hover:not(:disabled){background:#1769aa;}
      /* Modal styles */
      .modal{display:none;position:fixed;z-index:2000;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);justify-content:center;align-items:center;}
      .modal.open{display:flex;}
      .modal-content{background:#fff;padding:16px;border-radius:8px;box-shadow:0 2px 16px rgba(0,0,0,0.3);display:flex;flex-direction:column;align-items:center;max-width:90vw;max-height:90vh;}
      .modal-img{max-width:80vw;max-height:60vh;border-radius:4px;box-shadow:0 0 8px #0003;}
      .modal-caption{margin-top:8px;font-size:14px;color:#333;text-align:center;word-break:break-all;}
      .modal-nav{display:flex;justify-content:space-between;width:100%;margin-top:8px;}
      .modal-btn{background:#2196f3;color:white;border:none;padding:0.4rem 1.2rem;border-radius:4px;font-size:1.1rem;cursor:pointer;transition:background 0.2s;}
      .modal-btn:hover{background:#1769aa;}
                  .modal-close{position:absolute;top:24px;right:32px;font-size:2rem;color:white;background:none;border:none;cursor:pointer;z-index:2100;}
            
            /* Filmstrip and gallery styles */
            .filmstrip-row{display:flex;overflow-x:auto;gap:12px;padding-bottom:8px;margin-bottom:12px;white-space:nowrap;}
            .filmstrip-thumb{width:72px;height:72px;object-fit:cover;border:2px solid #ccc;border-radius:4px;cursor:pointer;transition:border 0.2s,box-shadow 0.2s;outline:none;}
            .filmstrip-thumb.selected{border:2px solid #2196f3;box-shadow:0 0 0 2px #2196f3;}
            .filmstrip-caption{font-size:11px;margin-bottom:2px;word-break:break-all;text-align:center;max-width:72px;}
            .gallery-viewer{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:320px;}
            .gallery-view-img{max-width:80vw;max-height:60vh;border-radius:4px;box-shadow:0 0 8px #0003;}
            .gallery-view-caption{margin-top:8px;font-size:14px;color:#333;text-align:center;word-break:break-all;}
            .gallery-view-nav{display:flex;justify-content:center;gap:16px;margin-top:12px;}
            .gallery-view-btn{background:#2196f3;color:white;border:none;padding:0.4rem 1.2rem;border-radius:4px;font-size:1.1rem;cursor:pointer;transition:background 0.2s;}
            .gallery-view-btn:disabled{background:#b0bec5;cursor:not-allowed;}
            .gallery-view-btn:hover:not(:disabled){background:#1769aa;}
    </style>
</head>
<body>
  <h1>Run a JMP task</h1>
  
  <div style="text-align: right; margin-bottom: 1rem;">
    <a href="/tasks" style="color: #9c27b0; text-decoration: none; font-weight: bold;">📋 View All Tasks</a>
  </div>

  <div id="serverStatus" class="server-status">
    <h3>Server Status</h3>
    <p id="serverStatusText">Checking...</p>
    <p id="queueInfo"></p>
    <button id="forceTerminateBtn" onclick="forceTerminate()" style="background:#d32f2f;color:white;border:none;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;margin-top:0.5rem;">
      🛑 Force Terminate All Tasks
    </button>
  </div>

  <form id="uploadForm" method="POST" action="/run"
        enctype="multipart/form-data">
    <label>CSV file:
      <input type="file" name="csv" accept=".csv" required>
    </label>

    <label>JSL file:
      <input type="file" name="jsl" accept=".jsl,.txt" required>
    </label>

    <button type="submit" id="submitBtn">Submit</button>
  </form>

  <div id="taskStatus" class="task-status" style="display:none">
    <h3>Task Status</h3>
    <p id="statusText">Processing...</p>
    <p id="taskId"></p>
    <div id="filmstrip" class="filmstrip-row"></div>
    <div id="galleryViewer" class="gallery-viewer" style="display:none;">
      <img id="galleryViewImg" class="gallery-view-img" src="" alt="">
      <div id="galleryViewCaption" class="gallery-view-caption"></div>
      <div class="gallery-view-nav">
        <button id="galleryPrev" class="gallery-view-btn">&larr; Prev</button>
        <button id="galleryNext" class="gallery-view-btn">Next &rarr;</button>
      </div>
    </div>
    <div id="downloadBtnContainer" style="margin-top:12px;"></div>
  </div>

  <p id="status">After you press <strong>Submit</strong> the task will be queued and processed in order.</p>

  <!-- Notification container -->
  <div id="notificationContainer"></div>

  <!-- Screenshot Modal -->
       <div id="screenshotModal" class="modal">
       <button class="modal-close" onclick="closeScreenshotModal()">&times;</button>
       <div class="modal-content">
         <h3 id="screenshotModalTitle">JMP State Screenshots</h3>
      <div id="screenshotModalContent">
        <div id="screenshotThumbnails" style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;max-width:80vw;"></div>
        <img id="screenshotModalImg" class="modal-img" src="" alt="">
        <div id="screenshotModalCaption" class="modal-caption"></div>
        <div class="modal-nav">
          <button id="screenshotPrev" class="modal-btn" onclick="prevScreenshot()">&larr; Prev</button>
          <button id="screenshotNext" class="modal-btn" onclick="nextScreenshot()">Next &rarr;</button>
        </div>
      </div>
    </div>
  </div>

  <script>
     // Initialize broadcast connection
     let broadcastConnection = null;
     
     // Check server status on page load
     checkServerStatus();
     
     // Update server status every 5 seconds
     setInterval(checkServerStatus, 5000);
     
     // Connect to broadcast stream
     function connectBroadcast() {
         try {
             broadcastConnection = new EventSource('/broadcast');
             
             broadcastConnection.onmessage = function(event) {
                 const data = JSON.parse(event.data);
                 
                 // Skip ping messages
                 if (data.type === 'ping') return;
                 
                 // Show notification
                 showNotification(data.message, data.type);
             };
             
             broadcastConnection.onerror = function(event) {
                 console.error('Broadcast connection error:', event);
                 // Reconnect after 5 seconds
                 setTimeout(connectBroadcast, 5000);
             };
             
             console.log('Connected to broadcast stream');
         } catch (error) {
             console.error('Failed to connect to broadcast:', error);
             // Retry after 5 seconds
             setTimeout(connectBroadcast, 5000);
         }
     }
     
     // Show notification
     function showNotification(message, type = 'info') {
         const container = document.getElementById('notificationContainer');
         const notification = document.createElement('div');
         notification.className = `notification ${type}`;
         notification.textContent = message;
         
         container.appendChild(notification);
         
         // Auto-remove after 5 seconds
         setTimeout(() => {
             if (notification.parentNode) {
                 notification.parentNode.removeChild(notification);
             }
         }, 5000);
     }
     
     // Start broadcast connection
     connectBroadcast();
     
     async function checkServerStatus() {
         try {
             const response = await fetch('/server-status');
             const result = await response.json();
             
             const statusDiv = document.getElementById('serverStatus');
             const statusText = document.getElementById('serverStatusText');
             const queueInfo = document.getElementById('queueInfo');
             const submitBtn = document.getElementById('submitBtn');
             
             if (result.busy) {
                 statusDiv.className = 'server-status server-busy';
                 statusText.textContent = '🔄 Server is busy processing a task';
                 queueInfo.textContent = `Queue length: ${result.queue_length} tasks waiting`;
                 submitBtn.disabled = false; // Still allow submission to queue
             } else {
                 statusDiv.className = 'server-status server-idle';
                 statusText.textContent = '✅ Server is idle and ready';
                 queueInfo.textContent = 'No tasks in queue';
                 submitBtn.disabled = false;
             }
         } catch (error) {
             console.error('Error checking server status:', error);
         }
     }
     
     document.getElementById('uploadForm').addEventListener('submit', async (e) => {
         e.preventDefault();
         
         const formData = new FormData(e.target);
         const statusDiv = document.getElementById('taskStatus');
         const statusText = document.getElementById('statusText');
         const taskId = document.getElementById('taskId');
         
         statusDiv.style.display = 'block';
         statusText.textContent = '⏳ Submitting task...';
         
         try {
             const response = await fetch('/run', {
                 method: 'POST',
                 body: formData
             });
             
             const result = await response.json();
             
                              if (response.ok) {
                     taskId.innerHTML = `Task ID: ${result.task_id} <a href="/task/${result.task_id}" style="color:#9c27b0;text-decoration:none;margin-left:8px;">👁️ View Details</a>`;
                     
                     if (result.status === 'queued') {
                     statusText.textContent = '📋 Task queued! Waiting for server to be available...';
                     statusText.className = 'pending';
                 } else if (result.status === 'processing') {
                     statusText.textContent = '⚡ Task started processing!';
                     statusText.className = 'pending';
                 }
                 
                 // Poll for status updates
                 pollTaskStatus(result.task_id);
             } else {
                 statusText.textContent = `❌ Error: ${result.error}`;
                 statusText.className = 'error';
             }
         } catch (error) {
             statusText.textContent = `❌ Network error: ${error.message}`;
             statusText.className = 'error';
         }
     });
     
     async function pollTaskStatus(taskId) {
         const statusText = document.getElementById('statusText');
         const filmstrip = document.getElementById('filmstrip');
         const galleryViewer = document.getElementById('galleryViewer');
         const galleryViewImg = document.getElementById('galleryViewImg');
         const galleryViewCaption = document.getElementById('galleryViewCaption');
         const galleryPrev = document.getElementById('galleryPrev');
         const galleryNext = document.getElementById('galleryNext');
         const downloadBtnContainer = document.getElementById('downloadBtnContainer');
         let galleryFiles = [];
         let currentIndex = 0;
         
         while (true) {
             try {
                 const response = await fetch(`/status/${taskId}`);
                 const result = await response.json();
                 
                 if (result.status === 'completed') {
                     statusText.textContent = '✅ Task completed! Downloading results...';
                     statusText.className = 'success';
                     
                     // Store task ID for screenshot modal
                     window.currentTaskId = taskId;
                     
                     // Show download button
                     let downloadHtml = `<a href="/download/${taskId}" class="download-btn" style="display:inline-block;padding:0.5rem 1.2rem;background:#2196f3;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;margin-right:8px;">⬇️ Download Results</a>`;
                     
                     // Add view details link
                     downloadHtml += `<a href="/task/${taskId}" style="display:inline-block;padding:0.5rem 1.2rem;background:#9c27b0;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;margin-right:8px;">👁️ View Details</a>`;
                     
                     // Add screenshot buttons if screenshots are available
                     if (result.initial_screenshots && result.initial_screenshots.length > 0) {
                         downloadHtml += `<button onclick="showScreenshotModal(${JSON.stringify(result.initial_screenshots)}, '${taskId}', 'Initial')" style="display:inline-block;padding:0.5rem 1.2rem;background:#4caf50;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;margin-right:8px;">📸 Initial State</button>`;
                     }
                     if (result.screenshots && result.screenshots.length > 0) {
                         downloadHtml += `<button onclick="showScreenshotModal(${JSON.stringify(result.screenshots)}, '${taskId}', 'Final')" style="display:inline-block;padding:0.5rem 1.2rem;background:#ff9800;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;">📸 Final State</button>`;
                     }
                     
                     downloadBtnContainer.innerHTML = downloadHtml;
                     
                     // Trigger download automatically the first time
                     if (!window._downloadedOnce) {
                         window._downloadedOnce = true;
                         window.location.href = `/download/${taskId}`;
                     }
                     break;
                 } else if (result.status === 'failed') {
                     statusText.textContent = `❌ Task failed: ${result.error}`;
                     statusText.className = 'error';
                     filmstrip.innerHTML = '';
                     galleryViewer.style.display = 'none';
                     downloadBtnContainer.innerHTML = `<a href="/task/${taskId}" style="display:inline-block;padding:0.5rem 1.2rem;background:#9c27b0;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;">👁️ View Details</a>`;
                     break;
                 } else if (result.status === 'terminated') {
                     statusText.textContent = `🛑 Task terminated: ${result.error}`;
                     statusText.className = 'error';
                     filmstrip.innerHTML = '';
                     galleryViewer.style.display = 'none';
                     downloadBtnContainer.innerHTML = `<a href="/task/${taskId}" style="display:inline-block;padding:0.5rem 1.2rem;background:#9c27b0;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;">👁️ View Details</a>`;
                     break;
                 } else if (result.status === 'queued') {
                     statusText.textContent = `📋 Queued (position: ${result.queue_position || 'unknown'})`;
                     statusText.className = 'pending';
                     filmstrip.innerHTML = '';
                     galleryViewer.style.display = 'none';
                     downloadBtnContainer.innerHTML = `<a href="/task/${taskId}" style="display:inline-block;padding:0.5rem 1.2rem;background:#9c27b0;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;">👁️ View Details</a>`;
                 } else {
                     // Show image count if available
                     if (typeof result.image_count !== 'undefined') {
                         statusText.textContent = `⏳ Processing... (${result.image_count} images generated)`;
                     } else {
                         statusText.textContent = `⏳ Processing... (${result.progress || 'Running'})`;
                     }
                     statusText.className = 'pending';
                     
                     // Show initial screenshots button if available during processing
                     if (result.initial_screenshots && result.initial_screenshots.length > 0) {
                         downloadBtnContainer.innerHTML = `<button onclick="showScreenshotModal(${JSON.stringify(result.initial_screenshots)}, '${taskId}', 'Initial')" style="display:inline-block;padding:0.5rem 1.2rem;background:#4caf50;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;margin-right:8px;">📸 View Initial State</button>`;
                     } else {
                         downloadBtnContainer.innerHTML = '';
                     }
                     
                     // Always show view details link during processing
                     downloadBtnContainer.innerHTML += `<a href="/task/${taskId}" style="display:inline-block;padding:0.5rem 1.2rem;background:#9c27b0;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;">👁️ View Details</a>`;
                     
                     // Show filmstrip and gallery viewer if available
                     if (Array.isArray(result.image_files) && result.image_files.length > 0) {
                         galleryFiles = result.image_files;
                         filmstrip.innerHTML = result.image_files.map((f, idx) =>
                             `<div class="gallery-item" style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;">
                                <span class="filmstrip-caption">${f}</span>
                                <img src="/task-file/${taskId}/${encodeURIComponent(f)}" alt="${f}" class="filmstrip-thumb" tabindex="0" data-idx="${idx}">
                            </div>`
                         ).join('');
                         // Add click/keyboard event listeners for filmstrip
                         setTimeout(() => {
                             document.querySelectorAll('.filmstrip-thumb').forEach(img => {
                                 img.onclick = function() { selectImage(parseInt(this.dataset.idx)); };
                                 img.onkeydown = function(e) { if (e.key === 'Enter' || e.key === ' ') selectImage(parseInt(this.dataset.idx)); };
                             });
                         }, 0);
                         // Show gallery viewer
                         galleryViewer.style.display = '';
                         // If new images, keep currentIndex in bounds
                         if (currentIndex >= galleryFiles.length) currentIndex = galleryFiles.length - 1;
                         updateGalleryViewer();
                     } else {
                         filmstrip.innerHTML = '';
                         galleryViewer.style.display = 'none';
                         galleryFiles = [];
                     }
                     downloadBtnContainer.innerHTML = '';
                 }
             } catch (error) {
                 statusText.textContent = `❌ Status check failed: ${error.message}`;
                 statusText.className = 'error';
                 filmstrip.innerHTML = '';
                 galleryViewer.style.display = 'none';
                 downloadBtnContainer.innerHTML = `<a href="/task/${taskId}" style="display:inline-block;padding:0.5rem 1.2rem;background:#9c27b0;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;">👁️ View Details</a>`;
                 break;
             }
             
             await new Promise(resolve => setTimeout(resolve, 2000));
         }
         // Gallery viewer logic
         function selectImage(idx) {
             if (!galleryFiles.length) return;
             currentIndex = idx;
             updateGalleryViewer();
             // Scroll selected thumbnail into view
             const thumb = document.querySelector(`.filmstrip-thumb[data-idx='${idx}']`);
             if (thumb) thumb.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
         }
         function updateGalleryViewer() {
             if (!galleryFiles.length) return;
             // Highlight selected thumbnail
             document.querySelectorAll('.filmstrip-thumb').forEach((img, idx) => {
                 if (idx === currentIndex) img.classList.add('selected');
                 else img.classList.remove('selected');
             });
             const f = galleryFiles[currentIndex];
             galleryViewImg.src = `/task-file/${taskId}/${encodeURIComponent(f)}`;
             galleryViewImg.alt = f;
             galleryViewCaption.textContent = f;
             galleryPrev.disabled = (currentIndex === 0);
             galleryNext.disabled = (currentIndex === galleryFiles.length - 1);
         }
         galleryPrev.onclick = function() { if (currentIndex > 0) { currentIndex--; updateGalleryViewer(); selectImage(currentIndex); } };
         galleryNext.onclick = function() { if (currentIndex < galleryFiles.length - 1) { currentIndex++; updateGalleryViewer(); selectImage(currentIndex); } };
         document.addEventListener('keydown', function(e) {
             if (galleryViewer.style.display === 'none') return;
             if (e.key === 'ArrowLeft' && currentIndex > 0) { currentIndex--; updateGalleryViewer(); selectImage(currentIndex); }
             if (e.key === 'ArrowRight' && currentIndex < galleryFiles.length - 1) { currentIndex++; updateGalleryViewer(); selectImage(currentIndex); }
         });
         // Select first image by default if available
         if (galleryFiles.length && galleryViewer.style.display !== 'none') {
             selectImage(currentIndex);
         }
     }
     
     async function forceTerminate() {
         if (!confirm('Are you sure you want to force terminate all tasks? This will clear the queue and close JMP.')) {
             return;
         }
         
         const btn = document.getElementById('forceTerminateBtn');
         btn.disabled = true;
         btn.textContent = '🛑 Terminating...';
         
         try {
             const response = await fetch('/force-terminate', {
                 method: 'POST'
             });
             
             const result = await response.json();
             
             if (response.ok) {
                 alert('✅ All tasks terminated successfully!');
                 // Refresh server status
                 checkServerStatus();
             } else {
                 alert(`❌ Error: ${result.error}`);
             }
         } catch (error) {
             alert(`❌ Network error: ${error.message}`);
         } finally {
             btn.disabled = false;
             btn.textContent = '🛑 Force Terminate All Tasks';
         }
     }
     
     // Screenshot modal functionality
     let currentScreenshots = [];
     let currentScreenshotIndex = 0;
     
     function showScreenshotModal(screenshots, taskId, screenshotType = 'Screenshots') {
         if (!screenshots || screenshots.length === 0) {
             alert('No screenshots available');
             return;
         }
         
         currentScreenshots = screenshots;
         currentScreenshotIndex = 0;
         
         const modal = document.getElementById('screenshotModal');
         const modalTitle = document.getElementById('screenshotModalTitle');
         const thumbnails = document.getElementById('screenshotThumbnails');
         const modalImg = document.getElementById('screenshotModalImg');
         const modalCaption = document.getElementById('screenshotModalCaption');
         
         // Update modal title
         modalTitle.textContent = `JMP ${screenshotType} State`;
         
         // Create thumbnails
         thumbnails.innerHTML = screenshots.map((screenshot, idx) => 
             `<img src="/screenshot/${taskId}/${encodeURIComponent(screenshot.filename)}" 
                   alt="${screenshot.window_name}" 
                   style="width:80px;height:60px;object-fit:cover;border:2px solid #ccc;border-radius:4px;cursor:pointer;margin-right:8px;"
                   onclick="selectScreenshot(${idx})"
                   class="${idx === 0 ? 'selected' : ''}">`
         ).join('');
         
         // Show first screenshot
         updateScreenshotViewer();
         
         // Show modal
         modal.classList.add('open');
     }
     
     function selectScreenshot(idx) {
         currentScreenshotIndex = idx;
         updateScreenshotViewer();
         
         // Update thumbnail selection
         document.querySelectorAll('#screenshotThumbnails img').forEach((img, i) => {
             if (i === idx) img.style.border = '2px solid #2196f3';
             else img.style.border = '2px solid #ccc';
         });
     }
     
     function updateScreenshotViewer() {
         if (currentScreenshots.length === 0) return;
         
         const screenshot = currentScreenshots[currentScreenshotIndex];
         const modalImg = document.getElementById('screenshotModalImg');
         const modalCaption = document.getElementById('screenshotModalCaption');
         const prevBtn = document.getElementById('screenshotPrev');
         const nextBtn = document.getElementById('screenshotNext');
         
         modalImg.src = `/screenshot/${window.currentTaskId}/${encodeURIComponent(screenshot.filename)}`;
         modalImg.alt = screenshot.window_name;
         modalCaption.textContent = screenshot.window_name;
         
         prevBtn.disabled = (currentScreenshotIndex === 0);
         nextBtn.disabled = (currentScreenshotIndex === currentScreenshots.length - 1);
     }
     
     function prevScreenshot() {
         if (currentScreenshotIndex > 0) {
             currentScreenshotIndex--;
             selectScreenshot(currentScreenshotIndex);
         }
     }
     
     function nextScreenshot() {
         if (currentScreenshotIndex < currentScreenshots.length - 1) {
             currentScreenshotIndex++;
             selectScreenshot(currentScreenshotIndex);
         }
     }
     
     function closeScreenshotModal() {
         const modal = document.getElementById('screenshotModal');
         modal.classList.remove('open');
         currentScreenshots = [];
         currentScreenshotIndex = 0;
     }
     
     // Close modal when clicking outside
     document.getElementById('screenshotModal').addEventListener('click', function(e) {
         if (e.target === this) {
             closeScreenshotModal();
         }
     });
     
     // Keyboard navigation for screenshot modal
     document.addEventListener('keydown', function(e) {
         const modal = document.getElementById('screenshotModal');
         if (modal.classList.contains('open')) {
             if (e.key === 'Escape') {
                 closeScreenshotModal();
             } else if (e.key === 'ArrowLeft') {
                 prevScreenshot();
             } else if (e.key === 'ArrowRight') {
                 nextScreenshot();
             }
         }
     });
  </script>
  <script>
  (async function bootWithStash() {
    const params = new URLSearchParams(location.search);
    const stash = params.get('stash');
    if (!stash) return;

    // Show something in the UI
    const statusDiv = document.getElementById('taskStatus');
    const statusText = document.getElementById('statusText');
    statusDiv.style.display = 'block';
    statusText.textContent = '🔒 Loading files provided by external app...';

    try {
      // Get stash info (filenames)
      const infoRes = await fetch(`/api/stash/${stash}`);
      const info = await infoRes.json();
      if (!infoRes.ok) throw new Error(info.error || 'stash not found');

      // Option A: auto-start immediately
      const startRes = await fetch(`/api/stash/${stash}/start`, { method: 'POST' });
      const start = await startRes.json();
      if (!startRes.ok) throw new Error(start.error || 'failed to start');

                           // Now poll the task just like normal
                     document.getElementById('taskId').innerHTML = `Task ID: ${start.task_id} <a href="/task/${start.task_id}" style="color:#9c27b0;text-decoration:none;margin-left:8px;">👁️ View Details</a>`;
                     statusText.textContent = '⚡ Task started (from stash)';
                     statusText.className = 'pending';
                     pollTaskStatus(start.task_id);
    } catch (e) {
      statusText.textContent = `❌ ${e.message}`;
      statusText.className = 'error';
    }
  })();
  </script>
</body>
</html>
"""

# === ROUTE: Home page ===
@app.route("/", methods=["GET"])
def index():
    return render_template_string(INDEX_HTML)

# === HELPER FUNCTIONS ===
def convert_jsl_paths(jsl_content: str, task_dir: Path) -> str:
    """Convert hardcoded paths in JSL to use task directory"""
    import re
    
    # Pattern to match Save Picture statements with hardcoded paths
    # This will match patterns like: Save Picture( "/path/to/file.png", PNG );
    save_picture_pattern = r'Save Picture\(\s*"([^"]+)"\s*,\s*([^)]+)\s*\)'
    
    def replace_save_picture(match):
        original_path = match.group(1)
        format_param = match.group(2)
        
        # Extract just the filename from the original path
        filename = Path(original_path).name
        
        # Create new path in task directory
        new_path = str(task_dir / filename)
        
        return f'Save Picture( "{new_path}", {format_param} )'
    
    # Only replace Save Picture statements - this is the main focus
    converted = re.sub(save_picture_pattern, replace_save_picture, jsl_content)
    
    return converted

def prepend_open_line(jsl_file: Path, csv_file: Path, task_dir: Path) -> None:
    header = [
        "//!                               // auto-run flag",
        f'Open("{csv_file}");',
        ""
    ]
    original = jsl_file.read_text(encoding="utf-8")
    
    # Convert paths in the JSL content
    converted_content = convert_jsl_paths(original, task_dir)
    
    # Log the conversion for debugging
    if original != converted_content:
        print(f"Path conversion applied to {jsl_file.name}:")
        print(f"  Task directory: {task_dir}")
        # Find and show Save Picture statements that were converted
        import re
        save_picture_pattern = r'Save Picture\(\s*"([^"]+)"\s*,\s*([^)]+)\s*\)'
        matches = re.findall(save_picture_pattern, converted_content)
        for path, format_param in matches:
            print(f"  Save Picture: {path} ({format_param})")
    
    jsl_file.write_text("\n".join(header) + converted_content, encoding="utf-8")

def find_jmp_processes():
    """Find all running JMP processes"""
    jmp_processes = []
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            if 'jmp' in proc.info['name'].lower():
                jmp_processes.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return jmp_processes

def wait_for_jmp_completion(timeout=MAX_WAIT_TIME):
    """Wait for JMP to finish processing by monitoring CPU usage and file changes"""
    start_time = time.time()
    initial_processes = find_jmp_processes()
    
    if not initial_processes:
        return False, "No JMP processes found"
    
    # Wait a bit for JMP to start processing
    time.sleep(2)
    
    while time.time() - start_time < timeout:
        current_processes = find_jmp_processes()
        
        # Check if any JMP process is still actively using CPU
        active_processes = []
        for proc in current_processes:
            try:
                cpu_percent = proc.cpu_percent()
                # Lower threshold and check for sustained activity
                if cpu_percent > 0.5:  # Lower threshold
                    active_processes.append(proc)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # If no active processes, JMP might be done
        if not active_processes:
            # Double-check by waiting a bit more
            time.sleep(1)
            final_check = find_jmp_processes()
            still_active = False
            for proc in final_check:
                try:
                    if proc.cpu_percent() > 0.5:
                        still_active = True
                        break
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            if not still_active:
                return True, "JMP processing completed"
        
        time.sleep(CHECK_INTERVAL)
    
    return False, "Timeout waiting for JMP completion"

def wait_for_jmp_completion_with_files(task_dir: Path, task_id: str, timeout=MAX_WAIT_TIME):
    """Wait for JMP to finish by monitoring file count stability and CPU usage, and update image count for client"""
    start_time = time.time()
    
    # Wait a bit for JMP to start processing
    time.sleep(3)
    
    # Track when we last saw file count change
    last_file_change_time = time.time()
    last_file_count = 0
    
    while time.time() - start_time < timeout:
        current_time = time.time()
        
        # Count PNG files
        png_files = list(task_dir.glob("*.png"))
        current_count = len(png_files)
        
        # Update task status with image count and filenames
        if task_id in task_status:
            task_status[task_id]["image_count"] = current_count
            task_status[task_id]["image_files"] = [f.name for f in png_files]
            task_status[task_id]["progress"] = f"Processing... {current_count} images generated"
        
        # Check if file count changed
        if current_count != last_file_count:
            last_file_change_time = current_time
            last_file_count = current_count
        
        # Check if JMP is still actively processing
        jmp_processes = find_jmp_processes()
        jmp_active = False
        for proc in jmp_processes:
            try:
                if proc.cpu_percent() > 0.5:
                    jmp_active = True
                    break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # Check completion conditions:
        # 1. File count hasn't changed for 5 seconds
        # 2. JMP is not actively using CPU
        # 3. We have at least some files (optional safety check)
        time_since_last_change = current_time - last_file_change_time
        
        if (time_since_last_change >= 5.0 and  # 5 seconds stability
            not jmp_active and                 # JMP not working
            current_count > 0):                # We have some files
            return True, f"JMP processing completed - found {current_count} output files (stable for {time_since_last_change:.1f}s)"
        
        time.sleep(CHECK_INTERVAL)
    
    # Timeout reached
    final_png_files = list(task_dir.glob("*.png"))
    final_count = len(final_png_files)
    if task_id in task_status:
        task_status[task_id]["image_count"] = final_count
        task_status[task_id]["image_files"] = [f.name for f in final_png_files]
        task_status[task_id]["progress"] = f"Timeout waiting for JMP completion. Found {final_count} images."
    return False, f"Timeout waiting for JMP completion. Found {final_count} files but processing may not be complete."

def run_jsl_with_jmp(jsl_path: Path, task_dir: Path, task_id: str) -> str:
    """Run JSL script with JMP and monitor completion"""
    try:
        # JSL file is already opened by the task processor, so we just need to run the script
        
        # Use AppleScript to run the script
        osa = '''
        tell application "System Events"
            tell application process "JMP"
                set frontmost to true
                delay 1
                try
                    keystroke "r" using {command down}
                    return "Run Script triggered ✅"
                on error errMsg
                    return "❌ AppleScript error: " & errMsg
                end try
            end tell
        end tell
        '''
        result = applescript.run(osa)
        
        # Wait for JMP to complete processing by monitoring output files
        completed, message = wait_for_jmp_completion_with_files(task_dir, task_id)
        
        if completed:
            return f"{result} - {message}"
        else:
            return f"{result} - {message}"
            
    except Exception as e:
        return f"❌ Error running JMP: {str(e)}"

def zip_folder(folder: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in folder.iterdir():
            # Only include files, not directories or symlinks
            if f.is_file() and not f.is_symlink():
                # Only include certain file types
                if f.suffix.lower() in {'.csv', '.jsl', '.png', '.txt'}:
                    zf.write(f, f.name)

def close_jmp_processes():
    """Close all JMP processes only if they exist"""
    try:
        jmp_processes = find_jmp_processes()
        if not jmp_processes:
            print("No JMP processes found to close")
            return
            
        for proc in jmp_processes:
            try:
                print(f"Closing JMP process {proc.pid}")
                proc.terminate()
                # Wait up to 5 seconds for graceful shutdown
                proc.wait(timeout=5)
            except (psutil.NoSuchProcess, psutil.TimeoutExpired):
                try:
                    # Force kill if graceful shutdown fails
                    proc.kill()
                    print(f"Force killed JMP process {proc.pid}")
                except psutil.NoSuchProcess:
                    pass
            except psutil.AccessDenied:
                print(f"Cannot close JMP process {proc.pid} - access denied")
        
        # Also try AppleScript to close JMP only if processes exist
        if jmp_processes:
            try:
                subprocess.run([
                    "osascript", "-e", 
                    'tell application "JMP" to quit'
                ], capture_output=True, timeout=10)
                print("Closed JMP via AppleScript")
            except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
                print("AppleScript JMP close failed or timed out")
            
    except Exception as e:
        print(f"Error closing JMP processes: {e}")

def capture_jmp_screenshots(task_dir: Path, task_id: str, screenshot_type: str = "initial") -> list:
    """Capture screenshots of all JMP windows and save them to task directory"""
    screenshots = []
    try:
        # Use AppleScript to get all JMP windows and capture screenshots
        osa = '''
        tell application "System Events"
            tell application process "JMP"
                set windowList to every window
                set screenshotList to {}
                repeat with i from 1 to count of windowList
                    set currentWindow to item i of windowList
                    set windowName to name of currentWindow
                    set windowPosition to position of currentWindow
                    set windowSize to size of currentWindow
                    
                    -- Capture screenshot of this window
                    set screenshotPath to "/tmp/jmp_screenshot_" & i & ".png"
                    do shell script "screencapture -R " & (item 1 of windowPosition as string) & "," & (item 2 of windowPosition as string) & "," & (item 1 of windowSize as string) & "," & (item 2 of windowSize as string) & " " & screenshotPath
                    
                    set screenshotInfo to {windowName:windowName, screenshotPath:screenshotPath, windowIndex:i}
                    set end of screenshotList to screenshotInfo
                end repeat
                return screenshotList
            end tell
        end tell
        '''
        
        result = applescript.run(osa)
        
        # Process the screenshots and move them to task directory
        if result and isinstance(result, list):
            for i, screenshot_info in enumerate(result):
                if isinstance(screenshot_info, dict) and 'screenshotPath' in screenshot_info:
                    temp_path = screenshot_info['screenshotPath']
                    window_name = screenshot_info.get('windowName', f'Window_{i+1}')
                    
                    # Create a safe filename
                    safe_name = "".join(c for c in window_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
                    safe_name = safe_name.replace(' ', '_')
                    if not safe_name:
                        safe_name = f'JMP_Window_{i+1}'
                    
                    filename = f"{screenshot_type}.png"
                    final_path = task_dir / filename
                    
                    # Move the screenshot to task directory
                    if os.path.exists(temp_path):
                        try:
                            # Open with PIL to ensure it's a valid image
                            with Image.open(temp_path) as img:
                                img.save(final_path, 'PNG')
                            
                            # Remove temp file
                            os.remove(temp_path)
                            
                            # Process screenshot in safe mode if enabled
                            if SAFE_MODE_ENABLED:
                                print(f"Processing {screenshot_type} screenshot in safe mode...")
                                extracted_text = process_screenshot_safe_mode(str(final_path), window_name)
                                print(f"Safe mode processing completed for {filename}")
                            
                            screenshots.append({
                                'filename': filename,
                                'window_name': window_name,
                                'path': str(final_path)
                            })
                            print(f"Captured {screenshot_type} screenshot: {filename} (Window: {window_name})")
                        except Exception as e:
                            print(f"Error processing {screenshot_type} screenshot {temp_path}: {e}")
                            if os.path.exists(temp_path):
                                os.remove(temp_path)
        
        if not screenshots:
            # Fallback: capture entire screen if no windows found
            try:
                fallback_path = task_dir / f"{screenshot_type}.png"
                subprocess.run(["screencapture", str(fallback_path)], check=True)
                
                # Process fallback screenshot in safe mode if enabled
                if SAFE_MODE_ENABLED:
                    print(f"Processing fallback {screenshot_type} screenshot in safe mode...")
                    extracted_text = process_screenshot_safe_mode(str(fallback_path), f"Full Screen Capture ({screenshot_type})")
                    print(f"Safe mode processing completed for fallback {screenshot_type} screenshot")
                
                screenshots.append({
                    'filename': f"{screenshot_type}.png",
                    'window_name': f"Full Screen Capture ({screenshot_type})",
                    'path': str(fallback_path)
                })
                print(f"Captured fallback {screenshot_type} full screen screenshot")
            except Exception as e:
                print(f"Error capturing fallback {screenshot_type} screenshot: {e}")
                
    except Exception as e:
        print(f"Error capturing JMP {screenshot_type} screenshots: {e}")
    
    return screenshots

def extract_text_from_image(image_path: str) -> str:
    """Extract text from image using OCR"""
    try:
        # Configure tesseract for better text recognition
        custom_config = r'--oem 3 --psm 6'
        text = pytesseract.image_to_string(Image.open(image_path), config=custom_config)
        return text.strip()
    except Exception as e:
        print(f"Error extracting text from image {image_path}: {e}")
        return "OCR processing failed"

def create_blank_image_with_text(text: str, original_size: tuple, window_name: str) -> Image.Image:
    """Create a blank image with OCR text overlay"""
    try:
        # Create a white background image with the same size as original
        img = Image.new('RGB', original_size, color='white')
        draw = ImageDraw.Draw(img)
        
        # Try to use a system font, fallback to default if not available
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 16)
        except:
            try:
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
            except:
                font = ImageFont.load_default()
        
        # Add title
        title = f"Safe Mode Screenshot - {window_name}"
        title_bbox = draw.textbbox((0, 0), title, font=font)
        title_width = title_bbox[2] - title_bbox[0]
        title_height = title_bbox[3] - title_bbox[1]
        
        # Center the title
        title_x = (original_size[0] - title_width) // 2
        title_y = 20
        
        draw.text((title_x, title_y), title, fill='black', font=font)
        
        # Add OCR text content
        if text and text.strip():
            # Split text into lines that fit the image width
            lines = []
            words = text.split()
            current_line = ""
            
            for word in words:
                test_line = current_line + (" " if current_line else "") + word
                bbox = draw.textbbox((0, 0), test_line, font=font)
                text_width = bbox[2] - bbox[0]
                
                if text_width <= original_size[0] - 40:  # 20px margin on each side
                    current_line = test_line
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
            
            if current_line:
                lines.append(current_line)
            
            # Draw lines with proper spacing
            line_height = title_height + 10
            y_position = title_y + line_height + 20
            
            for line in lines:
                if y_position + line_height > original_size[1] - 20:  # Leave margin at bottom
                    break
                
                line_bbox = draw.textbbox((0, 0), line, font=font)
                line_width = line_bbox[2] - line_bbox[0]
                line_x = (original_size[0] - line_width) // 2
                
                draw.text((line_x, y_position), line, fill='black', font=font)
                y_position += line_height + 5
        else:
            # Add message if no text was extracted
            no_text_msg = "No text detected in screenshot"
            msg_bbox = draw.textbbox((0, 0), no_text_msg, font=font)
            msg_width = msg_bbox[2] - msg_bbox[0]
            msg_x = (original_size[0] - msg_width) // 2
            msg_y = title_y + line_height + 20
            
            draw.text((msg_x, msg_y), no_text_msg, fill='gray', font=font)
        
        return img
        
    except Exception as e:
        print(f"Error creating blank image with text: {e}")
        # Return a simple white image with error message
        img = Image.new('RGB', original_size, color='white')
        draw = ImageDraw.Draw(img)
        draw.text((10, 10), f"Error processing screenshot: {str(e)}", fill='red')
        return img

def process_screenshot_safe_mode(image_path: str, window_name: str) -> str:
    """Process screenshot in safe mode: extract text and replace with blank image"""
    try:
        # Open original image to get dimensions
        with Image.open(image_path) as original_img:
            original_size = original_img.size
            
            # Extract text using OCR
            extracted_text = extract_text_from_image(image_path)
            print(f"Extracted text from {window_name}: {len(extracted_text)} characters")
            
            # Create blank image with text overlay
            safe_image = create_blank_image_with_text(extracted_text, original_size, window_name)
            
            # Save the safe image, overwriting the original
            safe_image.save(image_path, 'PNG')
            
            return extracted_text
            
    except Exception as e:
        print(f"Error processing screenshot in safe mode: {e}")
        # Create a simple error image
        try:
            with Image.open(image_path) as original_img:
                original_size = original_img.size
                error_img = Image.new('RGB', original_size, color='white')
                draw = ImageDraw.Draw(error_img)
                draw.text((10, 10), f"Safe mode processing failed: {str(e)}", fill='red')
                error_img.save(image_path, 'PNG')
        except:
            pass
        return "Safe mode processing failed"

def broadcast_notification(message, notification_type="info"):
    """Broadcast a notification to all connected clients"""
    with broadcast_lock:
        if broadcast_subscribers:
            notification = {
                "type": notification_type,
                "message": message,
                "timestamp": dt.datetime.now().isoformat()
            }
            
            # Send to all subscribers
            dead_connections = set()
            for client_queue in broadcast_subscribers:
                try:
                    client_queue.put_nowait(notification)
                except queue.Full:
                    # Client connection is dead, remove it
                    dead_connections.add(client_queue)
            
            # Clean up dead connections
            broadcast_subscribers.difference_update(dead_connections)
            
            print(f"📢 Broadcast sent to {len(broadcast_subscribers)} clients: {message}")

def force_terminate_all():
    """Force terminate all tasks, clear queue, and close JMP processes"""
    global task_queue, task_status, server_status
    
    print("🛑 Force terminating all tasks and clearing queue...")
    
    # Broadcast termination start
    broadcast_notification("🛑 Force termination initiated - clearing all tasks and queue", "warning")
    
    # Set shutdown flag
    shutdown_flag.set()
    
    # Clear the task queue
    queue_size = task_queue.qsize()
    while not task_queue.empty():
        try:
            task_queue.get_nowait()
            task_queue.task_done()
        except queue.Empty:
            break
    
    # Mark all tasks as failed
    terminated_count = 0
    for task_id in list(task_status.keys()):
        if task_status[task_id].get("status") in ["queued", "processing"]:
            task_status[task_id] = {"status": "terminated", "error": "Server force terminated"}
            terminated_count += 1
    
    # Reset server status
    with queue_lock:
        server_status["busy"] = False
        server_status["current_task"] = None
        server_status["queue_length"] = 0
    
    # Close all JMP processes
    close_jmp_processes()
    
    # Clear shutdown flag for next restart
    shutdown_flag.clear()
    
    # Broadcast completion
    completion_message = f"✅ Force termination completed - {terminated_count} tasks terminated, {queue_size} tasks removed from queue"
    broadcast_notification(completion_message, "success")
    
    print("✅ Force termination completed - server ready for new tasks")
    return {"status": "terminated", "message": completion_message}

def task_processor():
    """Background task processor that handles the queue"""
    while not shutdown_flag.is_set():
        try:
            # Get next task from queue
            task_data = task_queue.get(timeout=1)  # Wait 1 second for new tasks
            task_id, csv_path, jsl_path = task_data
            
            # Check if shutdown was requested
            if shutdown_flag.is_set():
                print(f"Shutdown requested, skipping task {task_id}")
                task_queue.task_done()
                continue
            
            with queue_lock:
                server_status["busy"] = True
                server_status["current_task"] = task_id
                server_status["queue_length"] = task_queue.qsize()
            
            try:
                task_status[task_id] = {"status": "processing", "progress": "Starting JMP"}
                
                # Close any existing JMP processes first
                close_jmp_processes()
                
                # Check for shutdown again after closing processes
                if shutdown_flag.is_set():
                    task_status[task_id] = {"status": "terminated", "error": "Server force terminated"}
                    task_queue.task_done()
                    continue
                
                # Get task directory
                task_dir = csv_path.parent
                
                # Modify JSL to open CSV and convert paths
                prepend_open_line(jsl_path, csv_path, task_dir)
                
                # Check for shutdown before running JMP
                if shutdown_flag.is_set():
                    task_status[task_id] = {"status": "terminated", "error": "Server force terminated"}
                    task_queue.task_done()
                    continue
                
                task_status[task_id]["progress"] = "Opening JSL file with JMP"
                
                # Open JSL file with JMP first
                subprocess.run(["open", str(jsl_path)], check=True)
                time.sleep(JMP_START_DELAY)
                
                # Start background thread for delayed screenshot capture
                def delayed_screenshot_capture():
                    try:
                        # Wait 10 seconds for JMP to load the script properly
                        print(f"Waiting 10 seconds for JMP to load script before capturing initial screenshots...")
                        time.sleep(10)
                        
                        # Capture initial screenshots after JMP opens the JSL file and loads it
                        print(f"Capturing initial screenshots for task {task_id}")
                        initial_screenshots = capture_jmp_screenshots(task_dir, task_id, "initial")
                        if initial_screenshots:
                            task_status[task_id]["initial_screenshots"] = initial_screenshots
                            print(f"Captured {len(initial_screenshots)} initial screenshots")
                    except Exception as e:
                        print(f"Error in delayed screenshot capture: {e}")
                
                # Start the background thread
                screenshot_thread = threading.Thread(target=delayed_screenshot_capture, daemon=True)
                screenshot_thread.start()
                
                task_status[task_id]["progress"] = "Running JSL script"
                status = run_jsl_with_jmp(jsl_path, task_dir, task_id)
                
                # Check for shutdown after JMP execution
                if shutdown_flag.is_set():
                    task_status[task_id] = {"status": "terminated", "error": "Server force terminated"}
                    task_queue.task_done()
                    continue
                
                if "❌" in status:
                    task_status[task_id] = {"status": "failed", "error": status}
                else:
                    # Capture screenshots of JMP windows before closing
                    jmp_processes = find_jmp_processes()
                    if jmp_processes:
                        print(f"JMP still running after task completion, capturing screenshots before closing {len(jmp_processes)} processes")
                        screenshots = capture_jmp_screenshots(task_dir, task_id, "final")
                        if screenshots:
                            # Update the current status with final screenshots
                            current_status = task_status[task_id].copy()
                            current_status["screenshots"] = screenshots
                            task_status[task_id] = current_status
                            print(f"Captured {len(screenshots)} final screenshots of JMP windows")
                            print(f"Task status now contains: {list(task_status[task_id].keys())}")
                            if "initial_screenshots" in task_status[task_id]:
                                print(f"Initial screenshots: {len(task_status[task_id]['initial_screenshots'])}")
                            if "screenshots" in task_status[task_id]:
                                print(f"Final screenshots: {len(task_status[task_id]['screenshots'])}")
                        close_jmp_processes()
                    else:
                        print("JMP already closed itself after task completion")
                    
                    # Create zip file AFTER capturing screenshots
                    task_status[task_id]["progress"] = "Creating results archive"
                    zip_path = task_dir / f"results_{task_id}.zip"
                    zip_folder(task_dir, zip_path)
                    
                    # Preserve existing task status data (like initial_screenshots) and add completion info
                    current_status = task_status[task_id].copy()
                    current_status.update({"status": "completed", "zip_path": str(zip_path)})
                    task_status[task_id] = current_status
                    
            except Exception as e:
                task_status[task_id] = {"status": "failed", "error": str(e)}
            
            finally:
                # Mark task as done and update server status
                task_queue.task_done()
                with queue_lock:
                    server_status["busy"] = False
                    server_status["current_task"] = None
                    server_status["queue_length"] = task_queue.qsize()
                    
        except queue.Empty:
            # No tasks in queue, continue waiting (unless shutdown requested)
            continue
        except Exception as e:
            print(f"Task processor error: {e}")
            continue
    
    print("Task processor shutdown complete")

# === ROUTE: Run task ===

def _make_id(prefix="stash"):
    return f"{prefix}_{dt.datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"

@app.route("/api/stash", methods=["POST"])
def api_stash():
    """
    Accepts either multipart (csv, jsl) or a single 'bundle' zip.
    Saves into STASH_DIR/<stash_id>/ and returns {stash_id, files:{csv,jsl}}.
    """
    stash_id = _make_id()
    stash_dir = STASH_DIR / stash_id
    stash_dir.mkdir(parents=True, exist_ok=True)

    csv_path = None
    jsl_path = None

    # Option 1: ZIP bundle
    if "bundle" in request.files:
        try:
            bio = io.BytesIO(request.files["bundle"].read())
            with ZipFile(bio) as zf:
                members = zf.namelist()
                csv_name = next((m for m in members if m.lower().endswith(".csv")), None)
                jsl_name = next((m for m in members if m.lower().endswith((".jsl",".txt"))), None)
                if not csv_name or not jsl_name:
                    return jsonify({"error": "ZIP must contain one .csv and one .jsl/.txt"}), 400
                zf.extract(csv_name, path=stash_dir)
                zf.extract(jsl_name, path=stash_dir)
                csv_path = stash_dir / csv_name
                jsl_path = stash_dir / jsl_name
        except Exception as e:
            return jsonify({"error": f"Invalid ZIP: {e}"}), 400

    # Option 2: multipart with csv+jsl
    else:
        if "csv" not in request.files or "jsl" not in request.files:
            return jsonify({"error":"Provide 'csv' and 'jsl' files or a 'bundle' ZIP"}), 400
        csv_in = request.files["csv"]
        jsl_in = request.files["jsl"]
        csv_path = stash_dir / csv_in.filename
        jsl_path = stash_dir / jsl_in.filename
        csv_in.save(csv_path)
        jsl_in.save(jsl_path)

    return jsonify({
        "stash_id": stash_id,
        "files": {"csv": csv_path.name, "jsl": jsl_path.name}
    })

@app.route("/api/stash/<stash_id>", methods=["GET"])
def api_stash_info(stash_id):
    stash_dir = STASH_DIR / stash_id
    if not stash_dir.exists():
        return jsonify({"error": "stash not found"}), 404

    files = [p.name for p in stash_dir.iterdir() if p.is_file()]
    csv = next((f for f in files if f.lower().endswith(".csv")), None)
    jsl = next((f for f in files if f.lower().endswith((".jsl",".txt"))), None)
    return jsonify({"stash_id": stash_id, "files": {"csv": csv, "jsl": jsl}})

@app.route("/api/stash/<stash_id>/start", methods=["POST"])
def api_stash_start(stash_id):
    """
    Turns a stash into a normal queued task (as if user uploaded through the form).
    """
    stash_dir = STASH_DIR / stash_id
    if not stash_dir.exists():
        return jsonify({"error": "stash not found"}), 404

    files = [p for p in stash_dir.iterdir() if p.is_file()]
    csv = next((p for p in files if p.name.lower().endswith(".csv")), None)
    jsl = next((p for p in files if p.name.lower().endswith((".jsl",".txt"))), None)
    if not csv or not jsl:
        return jsonify({"error":"stash incomplete, need csv+jsl"}), 400

    # Create a real task folder and move/copy into it
    task_id = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    task_dir = BASE_TASK_DIR / f"task_{task_id}"
    task_dir.mkdir(parents=True, exist_ok=True)

    csv_path = task_dir / csv.name
    jsl_path = task_dir / jsl.name
    csv_path.write_bytes(csv.read_bytes())
    jsl_path.write_bytes(jsl.read_bytes())

    with queue_lock:
        task_queue.put((task_id, csv_path, jsl_path))
        server_status["queue_length"] = task_queue.qsize()

    task_status[task_id] = {"status":"queued", "queue_position": task_queue.qsize(), "from_stash": stash_id}

    return jsonify({"task_id": task_id, "status": "processing" if not server_status["busy"] else "queued"})

@app.route("/run", methods=["POST"])
def run_task():
    if "csv" not in request.files or "jsl" not in request.files:
        abort(400, "Expecting 'csv' and 'jsl' uploads.")

    task_id = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    task_dir = BASE_TASK_DIR / f"task_{task_id}"
    task_dir.mkdir(parents=True)

    csv_in  = request.files["csv"]
    jsl_in  = request.files["jsl"]
    csv_path = task_dir / csv_in.filename
    jsl_path = task_dir / jsl_in.filename
    csv_in.save(csv_path)
    jsl_in.save(jsl_path)

    # Add task to queue
    with queue_lock:
        task_queue.put((task_id, csv_path, jsl_path))
        queue_position = task_queue.qsize()
        server_status["queue_length"] = task_queue.qsize()

    # Initialize task status
    task_status[task_id] = {
        "status": "queued", 
        "queue_position": queue_position
    }

    # Check if this is the first task (server not busy)
    if not server_status["busy"]:
        # Task will start immediately
        return jsonify({"task_id": task_id, "status": "processing"})
    else:
        # Task is queued
        return jsonify({"task_id": task_id, "status": "queued"})

# === ROUTE: Check task status ===
@app.route("/status/<task_id>")
def check_status(task_id):
    if task_id not in task_status:
        return jsonify({"error": "Task not found"}), 404
    
    status = task_status[task_id].copy()
    
    # Update queue position for queued tasks
    if status.get("status") == "queued":
        with queue_lock:
            # Calculate current position in queue
            current_position = 0
            temp_queue = queue.Queue()
            
            # Count tasks before this one
            while not task_queue.empty():
                try:
                    queued_task_id, _, _ = task_queue.get_nowait()
                    if queued_task_id == task_id:
                        current_position = temp_queue.qsize() + 1
                    temp_queue.put((queued_task_id, None, None))
                except queue.Empty:
                    break
            
            # Restore queue
            while not temp_queue.empty():
                task_queue.put(temp_queue.get())
            
            status["queue_position"] = current_position
    
    # Debug logging for completed tasks
    if status.get("status") == "completed":
        print(f"Status for task {task_id}: {list(status.keys())}")
        if "initial_screenshots" in status:
            print(f"  Initial screenshots: {len(status['initial_screenshots'])}")
        if "screenshots" in status:
            print(f"  Final screenshots: {len(status['screenshots'])}")
    
    return jsonify(status)

# === ROUTE: Download results ===
@app.route("/download/<task_id>")
def download_results(task_id):
    if task_id not in task_status:
        return jsonify({"error": "Task not found"}), 404
    
    status = task_status[task_id]
    if status["status"] != "completed":
        return jsonify({"error": "Task not completed"}), 400
    
    zip_path = Path(status["zip_path"])
    if not zip_path.exists():
        return jsonify({"error": "Results file not found"}), 404
    
    return send_file(
        zip_path,
        mimetype="application/zip",
        as_attachment=True,
        download_name=zip_path.name
    )

# === NEW API ROUTES FOR EXTERNAL APPLICATIONS ===

# === ROUTE: API Documentation ===
@app.route("/api/docs")
def api_docs():
    """API Documentation endpoint"""
    docs = {
        "title": "JMP Automation Server API",
        "version": "1.0",
        "description": "API for submitting CSV and JSL files to generate images and download results",
        "base_url": f"http://localhost:{PORT}",
        "endpoints": {
            "submit_task": {
                "url": "/api/submit",
                "method": "POST",
                "description": "Submit CSV and JSL files to start processing",
                "parameters": {
                    "csv": "CSV file (multipart/form-data)",
                    "jsl": "JSL file (multipart/form-data)"
                },
                "response": {
                    "task_id": "Unique task identifier",
                    "status": "queued|processing|completed|failed|terminated"
                }
            },
            "check_status": {
                "url": "/api/status/<task_id>",
                "method": "GET",
                "description": "Check task status and progress",
                "response": {
                    "status": "Current task status",
                    "progress": "Progress description",
                    "image_count": "Number of generated images",
                    "image_files": "List of generated image filenames",
                    "initial_screenshots": "Initial JMP window screenshots",
                    "screenshots": "Final JMP window screenshots"
                }
            },
            "list_tasks": {
                "url": "/api/tasks",
                "method": "GET",
                "description": "List all tasks with their status",
                "response": {
                    "tasks": "List of task objects with status information"
                }
            },
            "get_images": {
                "url": "/api/images/<task_id>",
                "method": "GET",
                "description": "Get list of generated images for a task",
                "response": {
                    "task_id": "Task identifier",
                    "images": "List of image filenames",
                    "image_urls": "List of direct image URLs"
                }
            },
            "download_results": {
                "url": "/api/download/<task_id>",
                "method": "GET",
                "description": "Download results zip file",
                "response": "ZIP file with all generated files"
            },
            "get_image": {
                "url": "/api/image/<task_id>/<filename>",
                "method": "GET",
                "description": "Get specific image file",
                "response": "PNG image file"
            },
            "get_screenshot": {
                "url": "/api/screenshot/<task_id>/<filename>",
                "method": "GET",
                "description": "Get specific screenshot file",
                "response": "PNG screenshot file"
            },
            "server_status": {
                "url": "/api/server-status",
                "method": "GET",
                "description": "Get server status and queue information",
                "response": {
                    "busy": "Whether server is processing a task",
                    "current_task": "Current task ID if busy",
                    "queue_length": "Number of tasks in queue"
                }
            }
        }
    }
    return jsonify(docs)

# === ROUTE: Submit task (API version) ===
@app.route("/api/submit", methods=["POST"])
def api_submit_task():
    """API endpoint for submitting tasks with better error handling"""
    try:
        if "csv" not in request.files or "jsl" not in request.files:
            return jsonify({
                "error": "Missing required files",
                "message": "Both 'csv' and 'jsl' files are required",
                "required_files": ["csv", "jsl"]
            }), 400

        csv_file = request.files["csv"]
        jsl_file = request.files["jsl"]
        
        # Validate file types
        if not csv_file.filename.lower().endswith('.csv'):
            return jsonify({
                "error": "Invalid file type",
                "message": "CSV file must have .csv extension"
            }), 400
            
        if not jsl_file.filename.lower().endswith(('.jsl', '.txt')):
            return jsonify({
                "error": "Invalid file type", 
                "message": "JSL file must have .jsl or .txt extension"
            }), 400

        task_id = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        task_dir = BASE_TASK_DIR / f"task_{task_id}"
        task_dir.mkdir(parents=True)

        csv_path = task_dir / csv_file.filename
        jsl_path = task_dir / jsl_file.filename
        csv_file.save(csv_path)
        jsl_file.save(jsl_path)

        # Add task to queue
        with queue_lock:
            task_queue.put((task_id, csv_path, jsl_path))
            queue_position = task_queue.qsize()
            server_status["queue_length"] = task_queue.qsize()

        # Initialize task status
        task_status[task_id] = {
            "status": "queued", 
            "queue_position": queue_position,
            "created_at": dt.datetime.now().isoformat(),
            "files": {
                "csv": csv_file.filename,
                "jsl": jsl_file.filename
            }
        }

        # Check if this is the first task (server not busy)
        if not server_status["busy"]:
            status = "processing"
        else:
            status = "queued"

        return jsonify({
            "task_id": task_id,
            "status": status,
            "queue_position": queue_position,
            "message": "Task submitted successfully"
        })

    except Exception as e:
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500

# === ROUTE: Check task status (API version) ===
@app.route("/api/status/<task_id>")
def api_check_status(task_id):
    """API endpoint for checking task status with enhanced information"""
    if task_id not in task_status:
        return jsonify({
            "error": "Task not found",
            "message": f"Task {task_id} does not exist"
        }), 404
    
    status = task_status[task_id].copy()
    
    # Update queue position for queued tasks
    if status.get("status") == "queued":
        with queue_lock:
            current_position = 0
            temp_queue = queue.Queue()
            
            while not task_queue.empty():
                try:
                    queued_task_id, _, _ = task_queue.get_nowait()
                    if queued_task_id == task_id:
                        current_position = temp_queue.qsize() + 1
                    temp_queue.put((queued_task_id, None, None))
                except queue.Empty:
                    break
            
            while not temp_queue.empty():
                task_queue.put(temp_queue.get())
            
            status["queue_position"] = current_position
    
    # Add API-specific information
    status["api_endpoints"] = {
        "images": f"/api/images/{task_id}",
        "download": f"/api/download/{task_id}",
        "screenshots": f"/api/screenshots/{task_id}" if status.get("status") == "completed" else None
    }
    
    return jsonify(status)

# === ROUTE: List all tasks ===
@app.route("/api/tasks")
def api_list_tasks():
    """API endpoint to list all tasks with their status"""
    tasks = []
    for task_id, status in task_status.items():
        task_info = {
            "task_id": task_id,
            "status": status.get("status"),
            "created_at": status.get("created_at"),
            "files": status.get("files", {}),
            "image_count": status.get("image_count", 0),
            "progress": status.get("progress", "")
        }
        
        # Add queue position for queued tasks
        if status.get("status") == "queued":
            task_info["queue_position"] = status.get("queue_position", 0)
        
        # Add completion info for completed tasks
        if status.get("status") == "completed":
            task_info["completed_at"] = dt.datetime.now().isoformat()
            task_info["zip_path"] = status.get("zip_path", "")
        
        tasks.append(task_info)
    
    # Sort by creation time (newest first)
    tasks.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return jsonify({
        "tasks": tasks,
        "total_tasks": len(tasks),
        "completed_tasks": len([t for t in tasks if t["status"] == "completed"]),
        "failed_tasks": len([t for t in tasks if t["status"] == "failed"]),
        "queued_tasks": len([t for t in tasks if t["status"] == "queued"]),
        "processing_tasks": len([t for t in tasks if t["status"] == "processing"])
    })

# === ROUTE: Get images for a task ===
@app.route("/api/images/<task_id>")
def api_get_images(task_id):
    """API endpoint to get list of generated images for a task"""
    if task_id not in task_status:
        return jsonify({
            "error": "Task not found",
            "message": f"Task {task_id} does not exist"
        }), 404
    
    status = task_status[task_id]
    task_dir = BASE_TASK_DIR / f"task_{task_id}"
    
    if not task_dir.exists():
        return jsonify({
            "error": "Task directory not found",
            "message": f"Task directory for {task_id} does not exist"
        }), 404
    
    # Get all PNG files
    png_files = list(task_dir.glob("*.png"))
    image_files = [f.name for f in png_files if f.name not in ["initial.png", "final.png"]]
    
    # Create image URLs
    base_url = request.host_url.rstrip('/')
    image_urls = [f"{base_url}/api/image/{task_id}/{filename}" for filename in image_files]
    
    return jsonify({
        "task_id": task_id,
        "images": image_files,
        "image_urls": image_urls,
        "total_images": len(image_files),
        "task_status": status.get("status")
    })

# === ROUTE: Get screenshots for a task ===
@app.route("/api/screenshots/<task_id>")
def api_get_screenshots(task_id):
    """API endpoint to get screenshots for a task"""
    if task_id not in task_status:
        return jsonify({
            "error": "Task not found",
            "message": f"Task {task_id} does not exist"
        }), 404
    
    status = task_status[task_id]
    
    screenshots = {
        "initial": [],
        "final": []
    }
    
    # Add initial screenshots if available
    if "initial_screenshots" in status:
        base_url = request.host_url.rstrip('/')
        for screenshot in status["initial_screenshots"]:
            screenshots["initial"].append({
                "filename": screenshot["filename"],
                "window_name": screenshot["window_name"],
                "url": f"{base_url}/api/screenshot/{task_id}/{screenshot['filename']}"
            })
    
    # Add final screenshots if available
    if "screenshots" in status:
        base_url = request.host_url.rstrip('/')
        for screenshot in status["screenshots"]:
            screenshots["final"].append({
                "filename": screenshot["filename"],
                "window_name": screenshot["window_name"],
                "url": f"{base_url}/api/screenshot/{task_id}/{screenshot['filename']}"
            })
    
    return jsonify({
        "task_id": task_id,
        "screenshots": screenshots,
        "total_initial": len(screenshots["initial"]),
        "total_final": len(screenshots["final"])
    })

# === ROUTE: Get specific image ===
@app.route("/api/image/<task_id>/<filename>")
def api_get_image(task_id, filename):
    """API endpoint to get a specific image file"""
    # Only allow PNG files for security
    if not filename.lower().endswith('.png'):
        return jsonify({
            "error": "Invalid file type",
            "message": "Only PNG files are allowed"
        }), 400
    
    # Find the task directory
    task_dir = BASE_TASK_DIR / f"task_{task_id}"
    file_path = task_dir / filename
    
    if not file_path.exists() or not file_path.is_file():
        return jsonify({
            "error": "File not found",
            "message": f"Image file {filename} not found for task {task_id}"
        }), 404
    
    return send_file(file_path, mimetype='image/png')

# === ROUTE: Get specific screenshot ===
@app.route("/api/screenshot/<task_id>/<filename>")
def api_get_screenshot(task_id, filename):
    """API endpoint to get a specific screenshot file"""
    # Only allow PNG files for security
    if not filename.lower().endswith('.png'):
        return jsonify({
            "error": "Invalid file type",
            "message": "Only PNG files are allowed"
        }), 400
    
    task_dir = BASE_TASK_DIR / f"task_{task_id}"
    file_path = task_dir / filename
    
    if not file_path.exists():
        return jsonify({
            "error": "File not found",
            "message": f"Screenshot file {filename} not found for task {task_id}"
        }), 404
    
    return send_file(file_path, mimetype='image/png')

# === ROUTE: Download results (API version) ===
@app.route("/api/download/<task_id>")
def api_download_results(task_id):
    """API endpoint to download results with better error handling"""
    if task_id not in task_status:
        return jsonify({
            "error": "Task not found",
            "message": f"Task {task_id} does not exist"
        }), 404
    
    status = task_status[task_id]
    if status["status"] != "completed":
        return jsonify({
            "error": "Task not completed",
            "message": f"Task {task_id} is not completed (status: {status['status']})"
        }), 400
    
    zip_path = Path(status["zip_path"])
    if not zip_path.exists():
        return jsonify({
            "error": "Results file not found",
            "message": f"Results file for task {task_id} not found"
        }), 404
    
    return send_file(
        zip_path,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"jmp_results_{task_id}.zip"
    )

# === ROUTE: Server status (API version) ===
@app.route("/api/server-status")
def api_server_status():
    """API endpoint for server status with enhanced information"""
    with queue_lock:
        status = server_status.copy()
    
    # Add additional server information
    status.update({
        "server_time": dt.datetime.now().isoformat(),
        "total_tasks": len(task_status),
        "completed_tasks": len([t for t in task_status.values() if t.get("status") == "completed"]),
        "failed_tasks": len([t for t in task_status.values() if t.get("status") == "failed"]),
        "queued_tasks": len([t for t in task_status.values() if t.get("status") == "queued"]),
        "processing_tasks": len([t for t in task_status.values() if t.get("status") == "processing"])
    })
    
    return jsonify(status)

# === ROUTE: Get server status ===
@app.route("/server-status")
def get_server_status():
    return jsonify(server_status)

# === ROUTE: Force terminate all tasks ===
@app.route("/force-terminate", methods=["POST"])
def force_terminate():
    """Force terminate all tasks, clear queue, and close JMP processes"""
    try:
        result = force_terminate_all()
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Force termination failed: {str(e)}"}), 500

# === ROUTE: Broadcast notifications (Server-Sent Events) ===
@app.route("/broadcast")
def broadcast_stream():
    """Server-Sent Events endpoint for real-time notifications"""
    def generate():
        # Create a queue for this client
        client_queue = queue.Queue(maxsize=10)
        
        # Add client to subscribers
        with broadcast_lock:
            broadcast_subscribers.add(client_queue)
        
        try:
            # Send initial connection message
            yield f"data: {json.dumps({'type': 'info', 'message': 'Connected to broadcast stream', 'timestamp': dt.datetime.now().isoformat()})}\n\n"
            
            # Keep connection alive and send notifications
            while True:
                try:
                    # Wait for notifications (with timeout for connection health check)
                    notification = client_queue.get(timeout=30)
                    yield f"data: {json.dumps(notification)}\n\n"
                except queue.Empty:
                    # Send keep-alive ping
                    yield f"data: {json.dumps({'type': 'ping', 'timestamp': dt.datetime.now().isoformat()})}\n\n"
                    
        except GeneratorExit:
            # Client disconnected
            pass
        finally:
            # Remove client from subscribers
            with broadcast_lock:
                broadcast_subscribers.discard(client_queue)
    
    return app.response_class(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        }
    )

# === ROUTE: Serve individual task image files securely ===
@app.route("/task-file/<task_id>/<filename>")
def serve_task_file(task_id, filename):
    # Only allow PNG files for security
    if not filename.lower().endswith('.png'):
        abort(403)
    # Find the task directory
    task_dir = BASE_TASK_DIR / f"task_{task_id}"
    file_path = task_dir / filename
    if not file_path.exists() or not file_path.is_file():
        abort(404)
    return send_file(file_path, mimetype='image/png')

@app.route("/screenshot/<task_id>/<filename>")
def serve_screenshot(task_id, filename):
    """Serve screenshot files from task directory"""
    # Only allow PNG files for security
    if not filename.lower().endswith('.png'):
        abort(400, "Only PNG files are allowed")
    
    task_dir = BASE_TASK_DIR / f"task_{task_id}"
    file_path = task_dir / filename
    
    if not file_path.exists():
        abort(404, "File not found")
    
    return send_file(file_path, mimetype='image/png')

# === NETWORK INFO AND EMAIL ===
def get_network_info():
    info = {}
    # Get hostname
    info['hostname'] = socket.gethostname()
    # Get all local IP addresses
    ip_list = []
    for iface in ['en0', 'en1', 'en2', 'en3', 'en4', 'en5', 'en6', 'en7', 'en8', 'en9', 'eth0', 'eth1', 'eth2', 'eth3', 'eth4', 'eth5', 'eth6', 'eth7', 'eth8', 'eth9']:
        try:
            ip = subprocess.check_output(["ipconfig", "getifaddr", iface], stderr=subprocess.DEVNULL).decode().strip()
            if ip:
                ip_list.append(f"{iface}: {ip}")
        except Exception:
            continue
    info['ip_addresses'] = ip_list
    # Get active network service
    try:
        active_service = subprocess.check_output(["route", "get", "default"], stderr=subprocess.DEVNULL).decode()
        for line in active_service.splitlines():
            if 'interface:' in line:
                iface = line.split(':')[-1].strip()
                info['active_interface'] = iface
                break
    except Exception:
        info['active_interface'] = 'unknown'
    # Get SSID if WiFi
    ssid = None
    if info.get('active_interface', '').startswith('en'):
        try:
            ssid = subprocess.check_output([
                "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
                "-I"
            ], stderr=subprocess.DEVNULL).decode()
            for line in ssid.splitlines():
                if ' SSID:' in line:
                    info['ssid'] = line.split(':', 1)[1].strip()
                    break
        except Exception:
            info['ssid'] = None
    return info

def send_startup_email():
    info = get_network_info()
    subject = "JMP Server Started"
    # Build clickable links for each IP
    links = []
    comprehensive_links = []
    for ip_entry in info.get('ip_addresses', []):
        ip = ip_entry.split(':', 1)[-1].strip()
        links.append(f"http://{ip}:{PORT}")
        comprehensive_links.append(f"http://{ip}:4569")
    links_html = '\n'.join(links)
    comprehensive_links_html = '\n'.join(comprehensive_links)
    body = f"""
JMP Automation Server has started.

Hostname: {info.get('hostname')}
Port: {PORT}
Active Interface: {info.get('active_interface', 'unknown')}
WiFi SSID: {info.get('ssid', 'N/A')}
IP Addresses:
{chr(10).join(info.get('ip_addresses', []))}

Web Interface Links:
{links_html}

For more comprehensive data analysis tools, visit:
{comprehensive_links_html}

New comprehensive tools include:

可访问：
http://159.75.92.201:4569
此版无JMP服务器

4.1 文件上传系统
- 拖放界面
- 支持Excel文件（.xlsx、.xls）
- 自动文件验证
- 上传期间进度跟踪
- 多表Excel文件支持

4.2 数据管理
- 基于会话的数据存储
- SQLite缓存以提高性能
- 自动数据类型检测
- 列分类（FAI、分类、时间）
- 数据预览功能

4.3 分析工具
- 基本统计分析
- 详细数据质量评估
- 相关性分析
- 异常值检测
- 数据完整性评估

4.4 可视化功能
- 带分组的箱线图生成
- IMR（个体移动极差）图表
- 过程能力分析
- Bin & Stack箱线图（JMP风格）
- 参考线集成
- 多分类分组

4.5 导出功能
- 多种格式支持（CSV、JSON、Parquet）
- 带JSL脚本的JMP集成
- 所有可视化的批量导出
- ZIP文件下载
- 直接Stash服务器集成
"""
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = icloud_email
    msg['To'] = ', '.join(recipient_email)
    
    # Send to TCP server first
    send_email_content_to_tcp_server(subject, body)
    
    # Try default route first
    try:
        with smtplib.SMTP_SSL('smtp.mail.me.com', 465) as server:
            server.login(icloud_email, app_password)
            server.sendmail(icloud_email, recipient_email, msg.as_string())
        print("Startup email sent successfully (default route).")
        return
    except Exception as e1:
        print(f"Failed to send startup email (default route): {e1}")
    # Try WiFi interface (en0) if available
    try:
        wifi_ip = None
        for ip_entry in info.get('ip_addresses', []):
            if ip_entry.startswith('en0:'):
                wifi_ip = ip_entry.split(':', 1)[-1].strip()
                break
        if wifi_ip:
            import socket as pysocket
            sock = pysocket.socket(pysocket.AF_INET, pysocket.SOCK_STREAM)
            sock.bind((wifi_ip, 0))
            context = smtplib.ssl.create_default_context()
            with smtplib.SMTP_SSL('smtp.mail.me.com', 465, context=context) as server:
                server.sock = sock
                server.connect('smtp.mail.me.com', 465)
                server.login(icloud_email, app_password)
                server.sendmail(icloud_email, recipient_email, msg.as_string())
            print(f"Startup email sent successfully (via WiFi en0: {wifi_ip}).")
            return
        else:
            print("No WiFi (en0) IP found to retry email send.")
    except Exception as e2:
        print(f"Failed to send startup email (via WiFi en0): {e2}")

def send_email_content_to_tcp_server(subject: str, body: str) -> bool:
    """Sends email content to a TCP server for logging/monitoring."""
    try:
        with socket.create_connection((TCP_SERVER_HOST, TCP_SERVER_PORT), timeout=5):
            pass # Test connection
    except (socket.timeout, ConnectionRefusedError):
        print(f"TCP server at {TCP_SERVER_HOST}:{TCP_SERVER_PORT} not available. Cannot send email content.")
        return False

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((TCP_SERVER_HOST, TCP_SERVER_PORT))
            s.sendall(f"Subject: {subject}\n\n{body}".encode())
            print(f"Email content sent to TCP server at {TCP_SERVER_HOST}:{TCP_SERVER_PORT}")
            return True
    except (socket.timeout, ConnectionRefusedError, OSError) as e:
        print(f"Failed to send email content to TCP server at {TCP_SERVER_HOST}:{TCP_SERVER_PORT}: {e}")
        return False

def process_csv_jsl_direct(
    csv_path: Path,
    jsl_path: Path,
    base_task_dir: Path = BASE_TASK_DIR,
    capture_initial: bool = True,
    capture_final: bool = True,
    timeout: int = MAX_WAIT_TIME,
) -> dict:
    """
    Run the full JMP pipeline synchronously (no Flask, no queue).
    - Copies the given CSV/JSL into a new task dir
    - Prepends Open() and rewrites Save Picture() paths
    - Opens JSL in JMP, runs it, waits for completion (files+CPU)
    - Optionally captures screenshots
    - Zips the results
    Returns: dict with status, task_id, task_dir, zip_path, image_files, screenshots info.
    """
    task_id = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    task_dir = base_task_dir / f"task_{task_id}"
    task_dir.mkdir(parents=True, exist_ok=True)

    # Normalize inputs
    csv_path = Path(csv_path).expanduser().resolve()
    jsl_path = Path(jsl_path).expanduser().resolve()
    if not csv_path.exists() or not jsl_path.exists():
        return {
            "status": "failed",
            "error": f"Input file missing: CSV exists={csv_path.exists()}, JSL exists={jsl_path.exists()}",
            "task_id": task_id,
        }

    # Copy inputs into task folder to keep behavior consistent with web pathing
    csv_dst = task_dir / csv_path.name
    jsl_dst = task_dir / jsl_path.name
    csv_dst.write_bytes(csv_path.read_bytes())
    jsl_dst.write_bytes(jsl_path.read_bytes())

    # Always start clean
    close_jmp_processes()

    # Rewrite JSL to open CSV and rewrite Save Picture() outputs
    try:
        prepend_open_line(jsl_dst, csv_dst, task_dir)
    except Exception as e:
        return {"status": "failed", "error": f"prepend_open_line error: {e}", "task_id": task_id}

    # Open JSL in JMP
    try:
        subprocess.run(["open", str(jsl_dst)], check=True)
    except subprocess.CalledProcessError as e:
        return {"status": "failed", "error": f"Failed to open JSL in JMP: {e}", "task_id": task_id}

    # Optional: capture initial screenshots after JMP loads
    if capture_initial:
        try:
            time.sleep(10)  # allow JMP to fully show UI
            initial_shots = capture_jmp_screenshots(task_dir, task_id, "initial")
        except Exception as e:
            initial_shots = []
    else:
        initial_shots = []

    # Run the script (Cmd+R) and wait for outputs
    run_status = run_jsl_with_jmp(jsl_dst, task_dir, task_id)

    # Optional: capture final screenshots before closing JMP
    final_shots = []
    if capture_final:
        try:
            final_shots = capture_jmp_screenshots(task_dir, task_id, "final")
        except Exception:
            pass

    # Always attempt to close JMP
    close_jmp_processes()

    # Collect generated images
    png_files = sorted([p.name for p in task_dir.glob("*.png")])

    # Create ZIP of results
    zip_path = task_dir / f"results_{task_id}.zip"
    try:
        zip_folder(task_dir, zip_path)
    except Exception as e:
        return {
            "status": "failed",
            "error": f"Zipping failed: {e}",
            "task_id": task_id,
            "task_dir": str(task_dir),
            "image_files": png_files,
            "initial_screenshots": initial_shots,
            "final_screenshots": final_shots,
        }

    # Determine pass/fail from run_status text (kept same style as queue worker)
    status = "failed" if "❌" in run_status else "completed"
    return {
        "status": status,
        "task_id": task_id,
        "task_dir": str(task_dir),
        "zip_path": str(zip_path),
        "image_files": png_files,
        "initial_screenshots": initial_shots,
        "final_screenshots": final_shots,
        "run_log": run_status,
    }

# === ROUTE: View specific task ===
@app.route("/task/<task_id>")
def view_task(task_id):
    """Display a dedicated page for viewing a specific task"""
    if task_id not in task_status:
        return render_template_string("""
        <!doctype html>
        <html>
        <head><title>Task Not Found</title></head>
        <body>
            <h1>Task Not Found</h1>
            <p>Task ID: {{ task_id }}</p>
            <p>This task does not exist or has been removed.</p>
            <a href="/">← Back to Home</a>
        </body>
        </html>
        """, task_id=task_id), 404
    
    status = task_status[task_id]
    
    # Create task view HTML
    task_html = f"""
    <!doctype html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <title>Task {task_id} - JMP Automation Service</title>
        <style>
            body {{ font-family: system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
                   max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }}
            .header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }}
            .back-link {{ color: #2196f3; text-decoration: none; }}
            .back-link:hover {{ text-decoration: underline; }}
            .task-info {{ background: #f5f5f5; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; }}
            .status-badge {{ display: inline-block; padding: 0.5rem 1rem; border-radius: 20px; color: white; font-weight: bold; }}
            .status-queued {{ background: #f57c00; }}
            .status-processing {{ background: #2196f3; }}
            .status-completed {{ background: #4caf50; }}
            .status-failed {{ background: #d32f2f; }}
            .status-terminated {{ background: #757575; }}
            .task-details {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
            .detail-card {{ background: white; padding: 1rem; border-radius: 8px; border: 1px solid #e0e0e0; }}
            .detail-card h3 {{ margin-top: 0; color: #333; }}
            .images-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
            .image-card {{ background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; }}
            .image-card img {{ width: 100%; height: 200px; object-fit: cover; cursor: pointer; }}
            .image-card .caption {{ padding: 0.5rem; text-align: center; font-size: 0.9rem; color: #666; }}
            .screenshots-section {{ margin-bottom: 2rem; }}
            .screenshot-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; }}
            .screenshot-card {{ background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; }}
            .screenshot-card img {{ width: 100%; height: 120px; object-fit: cover; cursor: pointer; }}
            .screenshot-card .caption {{ padding: 0.5rem; text-align: center; font-size: 0.8rem; color: #666; }}
            .actions {{ display: flex; gap: 1rem; flex-wrap: wrap; }}
            .btn {{ display: inline-block; padding: 0.75rem 1.5rem; background: #2196f3; color: white; text-decoration: none; border-radius: 6px; border: none; cursor: pointer; font-size: 1rem; }}
            .btn:hover {{ background: #1769aa; }}
            .btn-success {{ background: #4caf50; }}
            .btn-success:hover {{ background: #388e3c; }}
            .btn-warning {{ background: #ff9800; }}
            .btn-warning:hover {{ background: #f57c00; }}
            .progress-bar {{ width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; margin: 1rem 0; }}
            .progress-fill {{ height: 100%; background: #2196f3; transition: width 0.3s ease; }}
            .modal {{ display: none; position: fixed; z-index: 2000; left: 0; top: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); justify-content: center; align-items: center; }}
            .modal.open {{ display: flex; }}
            .modal-content {{ background: #fff; padding: 16px; border-radius: 8px; box-shadow: 0 2px 16px rgba(0,0,0,0.3); max-width: 90vw; max-height: 90vh; }}
            .modal-img {{ max-width: 80vw; max-height: 60vh; border-radius: 4px; }}
            .modal-close {{ position: absolute; top: 24px; right: 32px; font-size: 2rem; color: white; background: none; border: none; cursor: pointer; z-index: 2100; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Task Details: {task_id}</h1>
            <a href="/" class="back-link">← Back to Home</a>
        </div>
        
        <div class="task-info">
            <h2>Task Information</h2>
            <div class="task-details">
                <div class="detail-card">
                    <h3>Status</h3>
                    <span class="status-badge status-{status.get('status', 'unknown')}">
                        {status.get('status', 'Unknown').upper()}
                    </span>
                </div>
                <div class="detail-card">
                    <h3>Created</h3>
                    <p>{status.get('created_at', 'Unknown')}</p>
                </div>
                <div class="detail-card">
                    <h3>Files</h3>
                    <p>CSV: {status.get('files', {}).get('csv', 'Unknown')}</p>
                    <p>JSL: {status.get('files', {}).get('jsl', 'Unknown')}</p>
                </div>
                {f'<div class="detail-card"><h3>Queue Position</h3><p>{status.get("queue_position", "Unknown")}</p></div>' if status.get('status') == 'queued' else ''}
                {f'<div class="detail-card"><h3>Progress</h3><p>{status.get("progress", "Running")}</p></div>' if status.get('status') == 'processing' else ''}
                {f'<div class="detail-card"><h3>Images Generated</h3><p>{status.get("image_count", 0)} images</p></div>' if status.get('image_count', 0) > 0 else ''}
            </div>
            
            {f'<div class="actions"><a href="/download/{task_id}" class="btn btn-success">⬇️ Download Results</a></div>' if status.get('status') == 'completed' else ''}
            {f'<div class="actions"><a href="/api/download/{task_id}" class="btn btn-success">⬇️ Download Results (API)</a></div>' if status.get('status') == 'completed' else ''}
        </div>
    """
    
    # Add images section if available
    if status.get('image_count', 0) > 0:
        # Get image files from task directory first
        task_dir = BASE_TASK_DIR / f"task_{task_id}"
        png_files = []
        if task_dir.exists():
            png_files = [f for f in task_dir.glob("*.png") if f.name not in ["initial.png", "final.png"]]
        
        task_html += f"""
        <div class="images-section">
            <h2>Generated Images ({len(png_files)})</h2>
            
            <!-- Filmstrip row for thumbnails -->
            <div id="filmstrip" class="filmstrip-row">
        """
        
        if png_files:
            for idx, png_file in enumerate(png_files):
                task_html += f"""
                <div class="gallery-item" style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;">
                    <span class="filmstrip-caption">{png_file.name}</span>
                    <img src="/task-file/{task_id}/{png_file.name}" alt="{png_file.name}" class="filmstrip-thumb" tabindex="0" data-idx="{idx}" onclick="selectImage({idx})">
                </div>
                """
        
        task_html += f"""
            </div>
            
            <!-- Gallery viewer for full-size images -->
            <div id="galleryViewer" class="gallery-viewer">
                <img id="galleryViewImg" class="gallery-view-img" src="" alt="">
                <div id="galleryViewCaption" class="gallery-view-caption"></div>
                <div class="gallery-view-nav">
                    <button id="galleryPrev" class="gallery-view-btn">&larr; Prev</button>
                    <button id="galleryNext" class="gallery-view-btn">Next &rarr;</button>
                </div>
            </div>
        </div>
        
        <script>
            // Gallery viewer logic for task page
            let galleryFiles = {json.dumps([f.name for f in png_files])};
            let currentIndex = 0;
            
            function selectImage(idx) {{
                if (!galleryFiles.length) return;
                currentIndex = idx;
                updateGalleryViewer();
                // Scroll selected thumbnail into view
                const thumb = document.querySelector(`.filmstrip-thumb[data-idx='${{idx}}']`);
                if (thumb) thumb.scrollIntoView({{behavior:'smooth',inline:'center',block:'nearest'}});
            }}
            
            function updateGalleryViewer() {{
                if (!galleryFiles.length) return;
                // Highlight selected thumbnail
                document.querySelectorAll('.filmstrip-thumb').forEach((img, idx) => {{
                    if (idx === currentIndex) img.classList.add('selected');
                    else img.classList.remove('selected');
                }});
                const f = galleryFiles[currentIndex];
                document.getElementById('galleryViewImg').src = `/task-file/{task_id}/${{f}}`;
                document.getElementById('galleryViewImg').alt = f;
                document.getElementById('galleryViewCaption').textContent = f;
                document.getElementById('galleryPrev').disabled = (currentIndex === 0);
                document.getElementById('galleryNext').disabled = (currentIndex === galleryFiles.length - 1);
            }}
            
            // Set up navigation buttons
            document.getElementById('galleryPrev').onclick = function() {{ 
                if (currentIndex > 0) {{ 
                    currentIndex--; 
                    updateGalleryViewer(); 
                    selectImage(currentIndex); 
                }} 
            }};
            document.getElementById('galleryNext').onclick = function() {{ 
                if (currentIndex < galleryFiles.length - 1) {{ 
                    currentIndex++; 
                    updateGalleryViewer(); 
                    selectImage(currentIndex); 
                }} 
            }};
            
            // Keyboard navigation
            document.addEventListener('keydown', function(e) {{
                if (e.key === 'ArrowLeft' && currentIndex > 0) {{ 
                    currentIndex--; 
                    updateGalleryViewer(); 
                    selectImage(currentIndex); 
                }}
                if (e.key === 'ArrowRight' && currentIndex < galleryFiles.length - 1) {{ 
                    currentIndex++; 
                    updateGalleryViewer(); 
                    selectImage(currentIndex); 
                }}
            }});
            
            // Initialize gallery viewer
            if (galleryFiles.length > 0) {{
                selectImage(0);
            }}
        </script>
        """
    
    # Add screenshots section if available
    if status.get('initial_screenshots') or status.get('screenshots'):
        task_html += """
        <div class="screenshots-section">
            <h2>JMP Screenshots</h2>
        """
        
        # Initial screenshots
        if status.get('initial_screenshots'):
            task_html += f"""
            <h3>Initial State ({len(status['initial_screenshots'])} screenshots)</h3>
            <div class="screenshot-grid">
            """
            for screenshot in status['initial_screenshots']:
                task_html += f"""
                <div class="screenshot-card">
                    <img src="/screenshot/{task_id}/{screenshot['filename']}" alt="{screenshot['window_name']}" 
                         onclick="showImageModal('{screenshot['window_name']}', '/screenshot/{task_id}/{screenshot['filename']}')">
                    <div class="caption">{screenshot['window_name']}</div>
                </div>
                """
            task_html += "</div>"
            
            # Add screenshot modal button
            task_html += f"""
            <div style="margin-top: 1rem;">
                <button onclick="showScreenshotModal({json.dumps(status['initial_screenshots'])}, 'Initial')" 
                        style="display:inline-block;padding:0.5rem 1.2rem;background:#4caf50;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;">
                    📸 View Initial State Screenshots
                </button>
            </div>
            """
        
        # Final screenshots
        if status.get('screenshots'):
            task_html += f"""
            <h3>Final State ({len(status['screenshots'])} screenshots)</h3>
            <div class="screenshot-grid">
            """
            for screenshot in status['screenshots']:
                task_html += f"""
                <div class="screenshot-card">
                    <img src="/screenshot/{task_id}/{screenshot['filename']}" alt="{screenshot['window_name']}" 
                         onclick="showImageModal('{screenshot['window_name']}', '/screenshot/{task_id}/{screenshot['filename']}')">
                    <div class="caption">{screenshot['window_name']}</div>
                </div>
                """
            task_html += "</div>"
            
            # Add screenshot modal button
            task_html += f"""
            <div style="margin-top: 1rem;">
                <button onclick="showScreenshotModal({json.dumps(status['screenshots'])}, 'Final')" 
                        style="display:inline-block;padding:0.5rem 1.2rem;background:#ff9800;color:white;border:none;border-radius:4px;text-decoration:none;font-size:1rem;cursor:pointer;">
                    📸 View Final State Screenshots
                </button>
            </div>
            """
        
        task_html += "</div>"
    
    # Add error information if failed
    if status.get('status') == 'failed' and status.get('error'):
        task_html += f"""
        <div class="task-info" style="background: #ffebee; border-left: 4px solid #d32f2f;">
            <h2>Error Details</h2>
            <p><strong>Error:</strong> {status['error']}</p>
        </div>
        """
    
    # Add screenshot modal
    task_html += """
        <div id="screenshotModal" class="modal">
            <button class="modal-close" onclick="closeScreenshotModal()">&times;</button>
            <div class="modal-content">
                <h3 id="screenshotModalTitle">JMP State Screenshots</h3>
                <div id="screenshotModalContent">
                    <div id="screenshotThumbnails" style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;max-width:80vw;"></div>
                    <img id="screenshotModalImg" class="modal-img" src="" alt="">
                    <div id="screenshotModalCaption" class="modal-caption"></div>
                    <div class="modal-nav">
                        <button id="screenshotPrev" class="modal-btn" onclick="prevScreenshot()">&larr; Prev</button>
                        <button id="screenshotNext" class="modal-btn" onclick="nextScreenshot()">Next &rarr;</button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Image modal for individual images -->
        <div id="imageModal" class="modal">
            <button class="modal-close" onclick="closeImageModal()">&times;</button>
            <div class="modal-content">
                <img id="modalImg" class="modal-img" src="" alt="">
                <div id="modalCaption" style="text-align: center; margin-top: 1rem; font-weight: bold;"></div>
            </div>
        </div>
        
        <script>
            // Screenshot modal functionality
            let currentScreenshots = [];
            let currentScreenshotIndex = 0;
            
            function showScreenshotModal(screenshots, screenshotType = 'Screenshots') {
                if (!screenshots || screenshots.length === 0) {
                    alert('No screenshots available');
                    return;
                }
                
                currentScreenshots = screenshots;
                currentScreenshotIndex = 0;
                
                const modal = document.getElementById('screenshotModal');
                const modalTitle = document.getElementById('screenshotModalTitle');
                const thumbnails = document.getElementById('screenshotThumbnails');
                const modalImg = document.getElementById('screenshotModalImg');
                const modalCaption = document.getElementById('screenshotModalCaption');
                
                // Update modal title
                modalTitle.textContent = `JMP ${screenshotType} State`;
                
                // Create thumbnails
                thumbnails.innerHTML = screenshots.map((screenshot, idx) => 
                    `<img src="/screenshot/{task_id}/${encodeURIComponent(screenshot.filename)}" 
                           alt="${screenshot.window_name}" 
                           style="width:80px;height:60px;object-fit:cover;border:2px solid #ccc;border-radius:4px;cursor:pointer;margin-right:8px;"
                           onclick="selectScreenshot(${idx})"
                           class="${idx === 0 ? 'selected' : ''}">`
                ).join('');
                
                // Show first screenshot
                updateScreenshotViewer();
                
                // Show modal
                modal.classList.add('open');
            }
            
            function selectScreenshot(idx) {
                currentScreenshotIndex = idx;
                updateScreenshotViewer();
                
                // Update thumbnail selection
                document.querySelectorAll('#screenshotThumbnails img').forEach((img, i) => {
                    if (i === idx) img.style.border = '2px solid #2196f3';
                    else img.style.border = '2px solid #ccc';
                });
            }
            
            function updateScreenshotViewer() {
                if (currentScreenshots.length === 0) return;
                
                const screenshot = currentScreenshots[currentScreenshotIndex];
                const modalImg = document.getElementById('screenshotModalImg');
                const modalCaption = document.getElementById('screenshotModalCaption');
                const prevBtn = document.getElementById('screenshotPrev');
                const nextBtn = document.getElementById('screenshotNext');
                
                modalImg.src = `/screenshot/{task_id}/${encodeURIComponent(screenshot.filename)}`;
                modalImg.alt = screenshot.window_name;
                modalCaption.textContent = screenshot.window_name;
                
                prevBtn.disabled = (currentScreenshotIndex === 0);
                nextBtn.disabled = (currentScreenshotIndex === currentScreenshots.length - 1);
            }
            
            function prevScreenshot() {
                if (currentScreenshotIndex > 0) {
                    currentScreenshotIndex--;
                    selectScreenshot(currentScreenshotIndex);
                }
            }
            
            function nextScreenshot() {
                if (currentScreenshotIndex < currentScreenshots.length - 1) {
                    currentScreenshotIndex++;
                    selectScreenshot(currentScreenshotIndex);
                }
            }
            
            function closeScreenshotModal() {
                const modal = document.getElementById('screenshotModal');
                modal.classList.remove('open');
                currentScreenshots = [];
                currentScreenshotIndex = 0;
            }
            
            // Image modal functions
            function showImageModal(caption, imageSrc) {
                document.getElementById('modalImg').src = imageSrc;
                document.getElementById('modalCaption').textContent = caption;
                document.getElementById('imageModal').classList.add('open');
            }
            
            function closeImageModal() {
                document.getElementById('imageModal').classList.remove('open');
            }
            
            // Close modals when clicking outside
            document.getElementById('screenshotModal').addEventListener('click', function(e) {
                if (e.target === this) {
                    closeScreenshotModal();
                }
            });
            
            document.getElementById('imageModal').addEventListener('click', function(e) {
                if (e.target === this) {
                    closeImageModal();
                }
            });
            
            // Keyboard navigation for modals
            document.addEventListener('keydown', function(e) {
                const screenshotModal = document.getElementById('screenshotModal');
                const imageModal = document.getElementById('imageModal');
                
                if (screenshotModal.classList.contains('open')) {
                    if (e.key === 'Escape') {
                        closeScreenshotModal();
                    } else if (e.key === 'ArrowLeft') {
                        prevScreenshot();
                    } else if (e.key === 'ArrowRight') {
                        nextScreenshot();
                    }
                } else if (imageModal.classList.contains('open')) {
                    if (e.key === 'Escape') {
                        closeImageModal();
                    }
                }
            });
            
            // Auto-refresh for processing tasks
            if ('{status.get('status')}' === 'processing' || '{status.get('status')}' === 'queued') {
                setTimeout(function() {
                    window.location.reload();
                }, 5000);
            }
        </script>
    </body>
    </html>
    """
    
    return render_template_string(task_html)

# === ROUTE: List all tasks ===
@app.route("/tasks")
def list_tasks():
    """Display a page listing all tasks with links to view individual tasks"""
    tasks_html = f"""
    <!doctype html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <title>All Tasks - JMP Automation Service</title>
        <style>
            body {{ font-family: system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
                   max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }}
            .header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }}
            .back-link {{ color: #2196f3; text-decoration: none; }}
            .back-link:hover {{ text-decoration: underline; }}
            .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
            .stat-card {{ background: #f5f5f5; padding: 1rem; border-radius: 8px; text-align: center; }}
            .stat-number {{ font-size: 2rem; font-weight: bold; color: #2196f3; }}
            .stat-label {{ color: #666; margin-top: 0.5rem; }}
            .tasks-table {{ width: 100%; border-collapse: collapse; margin-top: 2rem; }}
            .tasks-table th, .tasks-table td {{ padding: 0.75rem; text-align: left; border-bottom: 1px solid #e0e0e0; }}
            .tasks-table th {{ background: #f5f5f5; font-weight: bold; }}
            .status-badge {{ display: inline-block; padding: 0.25rem 0.5rem; border-radius: 12px; color: white; font-size: 0.8rem; font-weight: bold; }}
            .status-queued {{ background: #f57c00; }}
            .status-processing {{ background: #2196f3; }}
            .status-completed {{ background: #4caf50; }}
            .status-failed {{ background: #d32f2f; }}
            .status-terminated {{ background: #757575; }}
            .view-link {{ color: #9c27b0; text-decoration: none; }}
            .view-link:hover {{ text-decoration: underline; }}
            .download-link {{ color: #4caf50; text-decoration: none; margin-left: 0.5rem; }}
            .download-link:hover {{ text-decoration: underline; }}
            .no-tasks {{ text-align: center; padding: 3rem; color: #666; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>All Tasks</h1>
            <a href="/" class="back-link">← Back to Home</a>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">{len(task_status)}</div>
                <div class="stat-label">Total Tasks</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{len([t for t in task_status.values() if t.get('status') == 'completed'])}</div>
                <div class="stat-label">Completed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{len([t for t in task_status.values() if t.get('status') == 'processing'])}</div>
                <div class="stat-label">Processing</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{len([t for t in task_status.values() if t.get('status') == 'queued'])}</div>
                <div class="stat-label">Queued</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{len([t for t in task_status.values() if t.get('status') in ['failed', 'terminated']])}</div>
                <div class="stat-label">Failed/Terminated</div>
            </div>
        </div>
    """
    
    if not task_status:
        tasks_html += """
        <div class="no-tasks">
            <h2>No tasks found</h2>
            <p>No tasks have been submitted yet.</p>
        </div>
        """
    else:
        # Sort tasks by creation time (newest first)
        sorted_tasks = sorted(task_status.items(), 
                            key=lambda x: x[1].get('created_at', ''), 
                            reverse=True)
        
        tasks_html += """
        <table class="tasks-table">
            <thead>
                <tr>
                    <th>Task ID</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Files</th>
                    <th>Progress</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
        """
        
        for task_id, status in sorted_tasks:
            # Format creation time
            created_at = status.get('created_at', 'Unknown')
            if created_at != 'Unknown':
                try:
                    dt_obj = dt.datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    created_at = dt_obj.strftime('%Y-%m-%d %H:%M:%S')
                except:
                    pass
            
            # Get file names
            csv_file = status.get('files', {}).get('csv', 'Unknown')
            jsl_file = status.get('files', {}).get('jsl', 'Unknown')
            
            # Get progress info
            progress = status.get('progress', '')
            if status.get('status') == 'queued':
                progress = f"Queue position: {status.get('queue_position', 'Unknown')}"
            elif status.get('status') == 'completed':
                progress = f"{status.get('image_count', 0)} images generated"
            elif status.get('status') in ['failed', 'terminated']:
                progress = status.get('error', 'Unknown error')
            
            tasks_html += f"""
            <tr>
                <td><strong>{task_id}</strong></td>
                <td><span class="status-badge status-{status.get('status', 'unknown')}">{status.get('status', 'Unknown').upper()}</span></td>
                <td>{created_at}</td>
                <td>CSV: {csv_file}<br>JSL: {jsl_file}</td>
                <td>{progress}</td>
                <td>
                    <a href="/task/{task_id}" class="view-link">👁️ View Details</a>
                    {f'<a href="/download/{task_id}" class="download-link">⬇️ Download</a>' if status.get('status') == 'completed' else ''}
                </td>
            </tr>
            """
        
        tasks_html += """
            </tbody>
        </table>
        """
    
    tasks_html += """
    </body>
    </html>
    """
    
    return render_template_string(tasks_html)

# === RUN ===
if __name__ == "__main__":
    # Start the task processor thread
    processor_thread = threading.Thread(target=task_processor, daemon=True)
    processor_thread.start()
    def run_flask():
        print("Starting JMP Automation Server...")
        print(f"Server will be available at http://localhost:{PORT}")
        print("Task processor started - only one task will run at a time")
        app.run(host="0.0.0.0", port=PORT)

    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Wait for Flask to start (simple delay, or could poll a health endpoint)
    time.sleep(2)
    send_startup_email()

    # Keep main thread alive
    flask_thread.join()
