const common = require("oci-common");
const core = require("oci-core");
const os = require("os");
const path = require("path");

const CONFIG_PATH = path.join(os.homedir(), ".oci", "config");
const SSH_PUBLIC_KEY = process.env.SSH_PUBLIC_KEY;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function run() {
  if (!SSH_PUBLIC_KEY) {
    console.error("Missing SSH_PUBLIC_KEY environment variable!");
    process.exit(1);
  }

  const provider = new common.ConfigFileAuthenticationDetailsProvider(CONFIG_PATH);
  const computeClient = new core.ComputeClient({ authenticationDetailsProvider: provider });

  const faultDomains = [undefined, "FAULT-DOMAIN-1", "FAULT-DOMAIN-2", "FAULT-DOMAIN-3"];

  log("=================================================");
  log("🚀 GITHUB ACTIONS: ORACLE ALWAYS-FREE CATCHER ACTIVE");
  log("Tenancy: " + provider.getTenantId());
  log("Shape: VM.Standard.A1.Flex (1 OCPU, 6 GB RAM)");
  log("Image: Canonical Ubuntu 24.04 aarch64");
  log("=================================================");

  const startTime = Date.now();
  const maxDurationMs = 25 * 60 * 1000; // Run for 25 minutes per GitHub run

  let attempt = 0;

  while (Date.now() - startTime < maxDurationMs) {
    attempt++;
    const currentFD = faultDomains[attempt % faultDomains.length];
    const fdLabel = currentFD || "Oracle Automatic Selection";

    const launchDetails = {
      availabilityDomain: "fhkj:AP-SINGAPORE-1-AD-1",
      compartmentId: provider.getTenantId(),
      displayName: "srh-link-toda-prod",
      shape: "VM.Standard.A1.Flex",
      shapeConfig: {
        ocpus: 1,
        memoryInGBs: 6
      },
      sourceDetails: {
        sourceType: "image",
        imageId: "ocid1.image.oc1.ap-singapore-1.aaaaaaaaw75ef2chh5goomskvdznqz36cadczqelqvndbqcozc5icyig57za"
      },
      createVnicDetails: {
        subnetId: "ocid1.subnet.oc1.ap-singapore-1.aaaaaaaavns6kntcpoxfyocunotyz5d76hw7ajvfbx33wfpip36uhlutyiia",
        assignPublicIp: true,
        displayName: "srh-link-toda-prod-vnic"
      },
      metadata: {
        ssh_authorized_keys: SSH_PUBLIC_KEY.trim()
      }
    };

    if (currentFD) {
      launchDetails.faultDomain = currentFD;
    }

    try {
      console.log(`[Attempt #${attempt} | ${fdLabel}] Requesting instance...`);
      const res = await computeClient.launchInstance({ launchInstanceDetails: launchDetails });

      log("🎉🎉🎉 SUCCESS! ALWAYS FREE INSTANCE CREATED! 🎉🎉🎉");
      log("Instance ID: " + res.instance.id);
      log("Display Name: " + res.instance.displayName);
      log("Lifecycle State: " + res.instance.lifecycleState);
      process.exit(0);
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("Out of host capacity") || err.statusCode === 500) {
        console.log(`Attempt #${attempt}: Out of capacity in ${fdLabel}. Retrying in 60s...`);
      } else if (err.statusCode === 429 || msg.includes("Too many requests")) {
        console.log(`Attempt #${attempt}: Rate limit cooldown. Pausing for 90s...`);
        await new Promise(r => setTimeout(r, 90000));
        continue;
      } else {
        console.log(`Attempt #${attempt}: ${msg.slice(0, 100)}`);
      }
    }

    const delayMs = 60000 + Math.floor(Math.random() * 10000);
    await new Promise(r => setTimeout(r, delayMs));
  }

  log("25 minutes elapsed for this GitHub Action cycle. Clean exit. Next scheduled run will continue automatically.");
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
