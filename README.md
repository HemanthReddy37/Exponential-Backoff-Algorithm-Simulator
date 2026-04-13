# Exponential Backoff Network Simulator

## Overview

The **Exponential Backoff Simulator** is an interactive web-based tool designed to visualize how collision handling works in computer networks using the exponential backoff algorithm (used in protocols like CSMA/CD).

It allows users to simulate multiple senders transmitting data over a shared communication channel and observe how collisions occur, how retransmissions are scheduled, and when packets are dropped after exceeding the maximum retry limit.

This project transforms a complex networking concept into a **clear, visual, and interactive learning experience**.

---

## Idea Behind the Project

In computer networks, concepts like **collisions**, **backoff algorithms**, and **retransmission strategies** are often difficult to understand through theory alone.

This simulator was built to:

* Provide a **visual representation** of packet transmission
* Demonstrate **real-time collision handling**
* Help students understand **how exponential backoff works internally**

---

## Key Features

### Simulation Controls

* Start, Pause, Resume simulation
* Auto mode (all senders transmit automatically)
* Random mode (random sender transmission)
* Manual packet sending per sender

### Network Simulation

* Multiple senders transmitting over a shared bus
* Collision detection and handling
* Real-time packet movement animation

### Exponential Backoff Logic

* Random wait time calculation based on collisions
* Backoff using formula:
  **wait = r × slotTime**
* Retry attempts increase after each collision

### Packet Drop Condition

* Packet is dropped when:

  ```
  attempt > 16
  ```
* Matches real-world Ethernet behavior

### Statistics Dashboard

* Per-sender metrics:

  * Collisions
  * Defers
  * Total wait time
  * Packets sent
  * Packets delivered
  * Packets dropped
* Global collision count

### Event Log

* Real-time logging of:

  * Packet creation
  * Collisions
  * Backoff delays
  * Retransmissions
  * Successful deliveries

---

## Tech Stack

### Frontend

* HTML
* CSS
* JavaScript (Vanilla JS)

### Libraries Used

* Font Awesome (icons)
* Google Fonts (UI styling)

---

## 🧠 Core Concepts Covered

* Exponential Backoff Algorithm
* CSMA/CD (Carrier Sense Multiple Access with Collision Detection)
* Collision Detection
* Network Transmission Scheduling
* Retry Mechanisms in Networks

---

##  How It Works

1. Multiple senders attempt to send packets
2. If two or more send at the same time → **collision occurs**
3. Each sender:
   * Waits for a random time based on backoff algorithm
4. Retries transmission
5. If a packet is in the reciver channel all packets at the bus will be retransmitted after waiting for random time based on backoff algorithm.
6. If attempts exceed 16 → **packet is dropped**

### Important Note

- If the initial collision count of a sender is set to **16**, then:
  - The very next collision increases the attempt count to **17**
  - Since `attempt > 16`, the packet is **dropped immediately and permanently**

- This simulates real Ethernet behavior where packets are discarded after exceeding the retry limit
---

##  How to Run

## 1. Clone the Repository

   ```bash
    git clone https://github.com/HemanthReddy37/Exponential-Backoff-Algorithm-Simulator.git
    cd Exponential-Backoff-Algorithm-Simulator
   ```

## 2. Open the folder in Visual Studio Code (VS CODE)
## 3. Install Live Server Extensions:
 * Go to Extensions(Ctrl+Shift+X)
 * Search for Live Server
 * Install it
## 4. Start the Local Server
 * Right click on **index.html**
 * Click "**Open with Live Server**"
## 5. Open in browser
 * The application will run at "**http://127.0.0.1:5500/index.html**"

---

## User Steps for Simulation
## How to Start the Simulation

1. Open the application in your browser  
2. Select the senders using the checkboxes  
3. (Optional) Set initial collision values (0–16) for each sender  
4. Choose a mode:
   - **Auto Mode** → all selected senders start transmitting automatically  
   - **Random Mode** → random senders transmit at intervals  
5. Click the **Start** button  

### During Simulation

- Click **Pause** to temporarily stop the simulation  
- Click **Resume** to continue  
- Use **+1 (Send)** button to manually send a packet from a sender  

### View Results

- Observe:
  - Packet movements in the network  
  - Collisions and retransmissions  
  - Live statistics per sender  
  - Event log updates
- To get the final report, click **Final Report** button after simulation.  

### Important Behavior

- If a sender’s attempt count exceeds **16**, the packet is:
  - ❌ **Dropped permanently**
- If you set initial collisions to **16**, the next collision will:
  - Increase attempt to **17**
  - Immediately drop the packet

---

## Learning Outcomes

* Understand how **Ethernet handles collisions**
* Learn **exponential backoff step-by-step**
* Visualize **network congestion behavior**
* Connect theory with **real-world implementation**

---

## Team Members
 * Bhavanam Hemanth Reddy - 2024BCS-016
 * Aeruva Sri Varun Reddy - 2024BCS-004
 * Payam Chakri Praveen - 2024BCS-045
 * Sidda Venkata Surya Prathap - 2024BCS-069
 
