import json
import math
from typing import Dict, Any, List, Tuple, Optional


class AudioAnalysisService:
    # Calibrated provisional thresholds (can be tuned via settings)
    MATCH_THRESHOLD = 0.82
    CANDIDATE_SEPARATION_MARGIN = 0.08
    SILENCE_RMS_THRESHOLD = 0.008
    CLIPPING_ZCR_THRESHOLD = 0.45

    @classmethod
    def evaluate_features(
        cls,
        input_features: Dict[str, float],
        reference_features_list: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Compare input audio signal features against reference baseline recordings.
        Returns outcome, similarity score, candidates, and calibrated diagnostic reasons.
        """
        rms = input_features.get("rms", 0.0)
        zcr = input_features.get("zcr", 0.0)

        # 1. Edge Case: Silence or near-silent recording
        if rms < cls.SILENCE_RMS_THRESHOLD:
            return {
                "status": "UNSUITABLE_AUDIO",
                "matched_ref": None,
                "score": None,
                "reason_code": "ENERGY_TOO_LOW_SILENCE",
                "message": "The uploaded audio contains insufficient acoustic energy (near-silent). Ensure the microphone is placed within 50cm of the active component.",
                "requires_review": False,
                "candidates": [],
            }

        # 2. Edge Case: Extreme clipping or white noise distortion
        if zcr > cls.CLIPPING_ZCR_THRESHOLD:
            return {
                "status": "UNSUITABLE_AUDIO",
                "matched_ref": None,
                "score": None,
                "reason_code": "CLIPPING_OR_EXCESSIVE_NOISE",
                "message": "High-frequency clipping or severe broadband noise detected. Decrease microphone gain and re-record away from air blow-off nozzles.",
                "requires_review": True,
                "candidates": [],
            }

        # 3. Calculate similarity against all reference recordings
        scored_candidates: List[Tuple[Dict[str, Any], float]] = []

        for ref in reference_features_list:
            ref_feat = ref.get("features", {})
            if not ref_feat:
                continue

            # Normalized Euclidean similarity across Centroid, Bandwidth, RMS, and ZCR
            c_diff = abs(input_features.get("centroid", 0.0) - ref_feat.get("centroid", 0.0)) / 5000.0
            b_diff = abs(input_features.get("bandwidth", 0.0) - ref_feat.get("bandwidth", 0.0)) / 4000.0
            r_diff = abs(input_features.get("rms", 0.0) - ref_feat.get("rms", 0.0)) / 0.20
            z_diff = abs(input_features.get("zcr", 0.0) - ref_feat.get("zcr", 0.0)) / 0.30

            weighted_dist = (0.45 * c_diff) + (0.25 * b_diff) + (0.15 * r_diff) + (0.15 * z_diff)
            # Bound similarity into [0.0, 1.0]
            similarity = max(0.0, min(1.0, 1.0 - weighted_dist))
            scored_candidates.append((ref, round(similarity, 4)))

        # Sort descending by similarity
        scored_candidates.sort(key=lambda x: x[1], reverse=True)

        candidate_results = []
        for ref, score in scored_candidates:
            tier = "HIGH" if score >= 0.85 else ("MODERATE" if score >= 0.75 else ("LOW" if score >= 0.60 else "MARGINAL"))
            candidate_results.append({
                "reference_id": ref["id"],
                "title": ref["title"],
                "fault_label": ref["fault_label"],
                "machine_name": ref.get("machine_name"),
                "similarity_score": score,
                "confidence_tier": tier,
            })

        if not scored_candidates:
            return {
                "status": "NO_RELIABLE_MATCH",
                "matched_ref": None,
                "score": None,
                "reason_code": "EMPTY_REFERENCE_LIBRARY",
                "message": "No reference audio recordings are currently registered for comparison.",
                "requires_review": True,
                "candidates": [],
            }

        top_ref, top_score = scored_candidates[0]

        # 4. Check Match Threshold
        if top_score < cls.MATCH_THRESHOLD:
            return {
                "status": "NO_RELIABLE_MATCH",
                "matched_ref": None,
                "score": top_score,
                "reason_code": "BELOW_MATCH_THRESHOLD",
                "message": f"Top similarity score ({top_score:.2f}) is below the calibrated acceptance threshold ({cls.MATCH_THRESHOLD:.2f}). No machine acoustic fault can be reliably identified.",
                "requires_review": True,
                "candidates": candidate_results[:5],
            }

        # 5. Check Ambiguity / Candidate Separation
        if len(scored_candidates) > 1:
            second_score = scored_candidates[1][1]
            separation = top_score - second_score
            if separation < cls.CANDIDATE_SEPARATION_MARGIN:
                return {
                    "status": "AMBIGUOUS_MATCH",
                    "matched_ref": top_ref,
                    "score": top_score,
                    "reason_code": "AMBIGUOUS_SEPARATION_MARGIN",
                    "message": f"Acoustic features match multiple reference profiles closely (separation {separation:.3f} < {cls.CANDIDATE_SEPARATION_MARGIN:.2f}). Expert review required to disambiguate.",
                    "requires_review": True,
                    "candidates": candidate_results[:5],
                }

        # 6. Reliable Match Confirmed
        return {
            "status": "MATCHED",
            "matched_ref": top_ref,
            "score": top_score,
            "reason_code": "MATCH_CONFIRMED",
            "message": f"Acoustic pattern closely matches verified reference '{top_ref['title']}' with score {top_score:.3f}.",
            "requires_review": top_ref.get("fault_label", "") != "Normal Operation",
            "candidates": candidate_results[:5],
        }
