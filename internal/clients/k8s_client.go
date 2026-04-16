package clients

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// K8sClient is a client for Kubernetes interactions specifically targeting the gateway operator CRDs.
type K8sClient struct {
	dynamicClient dynamic.Interface
}

// NewK8sClient creates a new K8sClient for the cluster or out-of-cluster setup.
func NewK8sClient() (*K8sClient, error) {
	// Try to get in-cluster config first
	config, err := rest.InClusterConfig()
	if err != nil {
		// Fallback to out-of-cluster config
		kubeconfig := clientcmd.NewDefaultClientConfigLoadingRules().GetDefaultFilename()
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("failed to build kubeconfig: %w", err)
		}
	}

	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %w", err)
	}

	return &K8sClient{
		dynamicClient: dynClient,
	}, nil
}

// DebugOverrideConfig holds the override info.
type DebugOverrideConfig struct {
	SamplingRate uint32            `json:"samplingRate,omitempty"`
	LogLevel     string            `json:"logLevel,omitempty"`
	CustomTags   map[string]string `json:"customTags,omitempty"`
}

var apiRouteGVR = schema.GroupVersionResource{
	Group:    "gateway.univision.com",
	Version:  "v1alpha1",
	Resource: "apiroutes",
}

// ApplyDebugOverride patches an ApiRoute to inject or remove the RouteDebugOverride on a specific rule.
// ruleName targets the Rule by name inside the ApiRoute. If clear is true, the override is removed.
func (c *K8sClient) ApplyDebugOverride(ctx context.Context, namespace, routeName, ruleName string, cfg *DebugOverrideConfig, clear bool) error {
	// Get the unstruct object
	unstr, err := c.dynamicClient.Resource(apiRouteGVR).Namespace(namespace).Get(ctx, routeName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get ApiRoute %s/%s: %w", namespace, routeName, err)
	}

	// Navigate to spec.rules
	rules, found, err := unstructured.NestedSlice(unstr.Object, "spec", "rules")
	if err != nil || !found {
		return fmt.Errorf("failed to extract rules from ApiRoute: %w", err)
	}

	modified := false
	for i, ruleItem := range rules {
		ruleMap, ok := ruleItem.(map[string]interface{})
		if !ok {
			continue
		}

		if ruleMap["name"] == ruleName {
			if clear {
				delete(ruleMap, "debugOverride")
			} else {
				override := map[string]interface{}{}
				if cfg.SamplingRate > 0 {
					override["samplingRate"] = int64(cfg.SamplingRate)
				}
				if cfg.LogLevel != "" {
					override["logLevel"] = cfg.LogLevel
				}
				if len(cfg.CustomTags) > 0 {
					tags := map[string]interface{}{}
					for k, v := range cfg.CustomTags {
						tags[k] = v
					}
					override["customTags"] = tags
				}
				ruleMap["debugOverride"] = override
			}
			rules[i] = ruleMap
			modified = true
			break
		}
	}

	if !modified {
		return fmt.Errorf("rule %s not found in ApiRoute %s", ruleName, routeName)
	}

	// Set updated rules back
	err = unstructured.SetNestedSlice(unstr.Object, rules, "spec", "rules")
	if err != nil {
		return fmt.Errorf("failed to set modified rules: %w", err)
	}

	// Update the object in Kubernetes
	_, err = c.dynamicClient.Resource(apiRouteGVR).Namespace(namespace).Update(ctx, unstr, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update ApiRoute %s/%s: %w", namespace, routeName, err)
	}

	return nil
}
